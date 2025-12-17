import { GoogleGenAI, Type, Schema } from "@google/genai";
import { connectToDatabase, User } from '../lib/mongodb.js';

// --- CONFIGURATION ---
const CACHE_VERSION = 'v1'; 
const TTL_SUCCESS = 24 * 60 * 60 * 1000; 
const TTL_MOCK = 5 * 60 * 1000; 
const DAILY_LIMIT = 30;

// In-memory cache
const cache = new Map<string, { data: any, timestamp: number, isMock: boolean }>();

// --- KEY ROTATION LOGIC ---
const getRotatedApiKey = () => {
    const keys = [
        process.env.GEMINI_API_KEY,
        process.env.GEMINI_API_KEY_2,
        process.env.GEMINI_API_KEY_3,
        process.env.GEMINI_API_KEY_4,
        process.env.GEMINI_API_KEY_5
    ].filter(k => !!k && k.length > 10); // Filter out undefined or empty

    if (keys.length === 0) return null;
    // Pick random key to spread load
    return keys[Math.floor(Math.random() * keys.length)];
};

// --- MOCK DATA ---
const getMockData = (word: string, reason: 'overload' | 'quota' = 'overload') => ({
    word: word,
    phonetic: `/${word.substring(0, 3)}.../`,
    partOfSpeech: "noun (simulated)",
    definition: reason === 'quota' 
        ? "We hit our daily AI limit. This is a placeholder while we cool down." 
        : "We are currently experiencing high traffic. This definition is temporarily unavailable.",
    etymology: "The etymology origins are temporarily obscured. Please try again in a few minutes.",
    roots: [
        { term: "System", language: "Digital", meaning: reason === 'quota' ? "Limit Reached" : "Overload" },
        { term: "Retry", language: "Action", meaning: "Later" }
    ],
    examples: [`The word "${word}" is popular right now!`],
    synonyms: ["Unavailable", "Pending"],
    funFact: "This is a placeholder response.",
    isMock: true,
    mockReason: reason
});

// Helper to retry generation
const generateWithRetry = async (ai: GoogleGenAI, params: any, retries = 3) => {
    for (let i = 0; i < retries; i++) {
        try {
            return await ai.models.generateContent(params);
        } catch (e: any) {
            const msg = (e.message || "").toLowerCase();
            const status = e.status;

            const isOverloaded = status === 503 || msg.includes('503') || msg.includes('overloaded');
            
            if (isOverloaded && i < retries - 1) {
                const delay = 1500 * Math.pow(2, i); 
                await new Promise(r => setTimeout(r, delay));
                continue;
            }
            throw e;
        }
    }
    throw new Error("Model overloaded after retries");
}

export default async function handler(request: any, response: any) {
  try {
    // 1. Get Rotated Key
    const apiKey = getRotatedApiKey();
    if (!apiKey) {
      return response.status(500).json({ error: "Configuration Error: No API Keys found." });
    }

    const { word, userId } = request.query;
    if (!word) {
      return response.status(400).json({ error: "Word parameter is required" });
    }

    const cleanWord = (word as string).trim().toLowerCase();
    const cacheKey = `${CACHE_VERSION}:details:${cleanWord}`;

    // 2. Check Cache
    const cached = cache.get(cacheKey);
    if (cached) {
        const ttl = cached.isMock ? TTL_MOCK : TTL_SUCCESS;
        if (Date.now() - cached.timestamp < ttl) {
            return response.status(200).json(cached.data);
        }
    }

    // 3. Check Daily Limit (Only if not cached)
    // Note: With key rotation, we might want to relax this, but keeping it per-user is good hygiene.
    if (userId) {
       try {
         const db = await connectToDatabase();
         if (db) {
             const user = await User.findOne({ userId: userId.toString() });
             if (user) {
                 const today = new Date();
                 today.setHours(0,0,0,0);
                 const todayCount = user.searchHistory.filter((h: any) => h.timestamp > today.getTime()).length;
                 
                 // Bump limit to 50 since we have rotated keys now
                 if (todayCount >= 50) { 
                     const mock = getMockData(cleanWord, 'quota');
                     return response.status(200).json(mock);
                 }
             }
         }
       } catch (dbErr) {
           console.warn("DB Limit Check Failed:", dbErr);
       }
    }

    // 4. Initialize Gemini with Rotated Key
    const ai = new GoogleGenAI({ apiKey });
    
    const schema: Schema = {
      type: Type.OBJECT,
      properties: {
        word: { type: Type.STRING },
        phonetic: { type: Type.STRING },
        partOfSpeech: { type: Type.STRING },
        definition: { type: Type.STRING },
        etymology: { type: Type.STRING },
        roots: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              term: { type: Type.STRING },
              language: { type: Type.STRING },
              meaning: { type: Type.STRING },
            }
          }
        },
        examples: { type: Type.ARRAY, items: { type: Type.STRING } },
        synonyms: { type: Type.ARRAY, items: { type: Type.STRING } },
        funFact: { type: Type.STRING },
      },
      required: ["word", "phonetic", "definition", "etymology", "roots", "examples", "synonyms", "funFact"]
    };

    try {
        const result: any = await generateWithRetry(ai, {
            model: 'gemini-2.5-flash',
            contents: `Analyze "${cleanWord}" for etymology app. Precise, concise details.`,
            config: {
                responseMimeType: 'application/json',
                responseSchema: schema,
                systemInstruction: "Expert etymologist. Concise.",
                maxOutputTokens: 1000
            }
        });

        let text = result.text;
        if (!text) throw new Error("No text returned");
        
        text = text.replace(/^```(json)?/, '').replace(/```$/, '');
        const parsedData = JSON.parse(text);

        if (cache.size > 100) cache.delete(cache.keys().next().value!);
        cache.set(cacheKey, { data: parsedData, timestamp: Date.now(), isMock: false });

        return response.status(200).json(parsedData);

    } catch (aiError: any) {
        console.error("AI Gen Failed:", aiError.message);
        const msg = (aiError.message || "").toLowerCase();
        
        // If one key fails with quota, we return mock, BUT the next user request will pick a DIFFERENT key
        // from the pool, effectively bypassing the block for the app as a whole.
        const isQuota = aiError.status === 429 || msg.includes('429') || msg.includes('quota');
        const mock = getMockData(cleanWord, isQuota ? 'quota' : 'overload');
        
        // Shorter cache for failures
        cache.set(cacheKey, { data: mock, timestamp: Date.now(), isMock: true });
        
        return response.status(200).json(mock);
    }

  } catch (error: any) {
    console.error("Critical API Error:", error);
    if (request.query.word) {
        return response.status(200).json(getMockData(request.query.word as string));
    }
    return response.status(500).json({ error: "Internal Server Error" });
  }
}