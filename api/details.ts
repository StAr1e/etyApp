import { GoogleGenAI, Type, Schema } from "@google/genai";
import { connectToDatabase, User } from '../lib/mongodb.js';

// --- CONFIGURATION ---
const CACHE_VERSION = 'v1'; // Bump this to invalidate all cache
const TTL_SUCCESS = 24 * 60 * 60 * 1000; // 24 Hours
const TTL_MOCK = 5 * 60 * 1000; // 5 Minutes (Try real API again soon)
const DAILY_LIMIT = 30;

// In-memory cache (Map<"v1:details:word", { data, timestamp, isMock }>)
const cache = new Map<string, { data: any, timestamp: number, isMock: boolean }>();

// --- MOCK DATA GENERATOR ---
const getMockData = (word: string, reason: 'overload' | 'quota' = 'overload') => ({
    word: word,
    phonetic: `/${word.substring(0, 3)}.../`,
    partOfSpeech: "noun (simulated)",
    definition: reason === 'quota' 
        ? "We hit our daily AI limit, so we generated this placeholder definition to keep the app running. Come back tomorrow for the real deal!" 
        : "We are currently experiencing high traffic. This definition is temporarily unavailable.",
    etymology: reason === 'quota'
        ? "The origins of this word are currently locked behind a paywall of time. (Quota Exceeded)"
        : "The etymology origins are temporarily obscured by digital fog. Please try again in a few minutes.",
    roots: [
        { term: "System", language: "Digital", meaning: reason === 'quota' ? "Limit Reached" : "Overload" },
        { term: "Retry", language: "Action", meaning: "Later" }
    ],
    examples: [`The word "${word}" is popular right now!`],
    synonyms: ["Unavailable", "Pending"],
    funFact: reason === 'quota' 
        ? "Even AIs need a nap sometimes. We've reached our safe limit for today." 
        : "This is a placeholder response because our AI brain is thinking too hard about other words right now!",
    isMock: true, // Frontend can use this to show a warning if needed
    mockReason: reason
});

// Helper to retry generation on 503/Overloaded errors
const generateWithRetry = async (ai: GoogleGenAI, params: any, retries = 3) => {
    for (let i = 0; i < retries; i++) {
        try {
            return await ai.models.generateContent(params);
        } catch (e: any) {
            const msg = (e.message || "").toLowerCase();
            const status = e.status;

            const isOverloaded = 
                status === 503 || 
                msg.includes('503') || 
                msg.includes('overloaded') || 
                msg.includes('unavailable');
            
            if (isOverloaded && i < retries - 1) {
                const delay = 1500 * Math.pow(2, i); // Exponential backoff
                console.log(`AI Overloaded (Attempt ${i+1}/${retries}). Retrying in ${delay}ms...`);
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
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return response.status(500).json({ error: "Configuration Error: GEMINI_API_KEY is missing." });
    }

    const { word, userId } = request.query;
    if (!word) {
      return response.status(400).json({ error: "Word parameter is required" });
    }

    // 1. Normalize Input
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
    if (userId) {
       try {
         const db = await connectToDatabase();
         if (db) {
             const user = await User.findOne({ userId: userId.toString() });
             if (user) {
                 const today = new Date();
                 today.setHours(0,0,0,0);
                 const todayCount = user.searchHistory.filter((h: any) => h.timestamp > today.getTime()).length;
                 
                 if (todayCount >= DAILY_LIMIT) {
                     // Return Mock Data immediately if user quota hit
                     const mock = getMockData(cleanWord, 'quota');
                     return response.status(200).json(mock);
                 }
             }
         }
       } catch (dbErr) {
           console.warn("DB Limit Check Failed:", dbErr);
       }
    }

    // 4. Initialize Gemini
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
        
        // Clean markdown
        text = text.replace(/^```(json)?/, '').replace(/```$/, '');
        const parsedData = JSON.parse(text);

        // Success: Cache for 24 hours
        if (cache.size > 100) cache.delete(cache.keys().next().value!);
        cache.set(cacheKey, { data: parsedData, timestamp: Date.now(), isMock: false });

        return response.status(200).json(parsedData);

    } catch (aiError: any) {
        console.error("AI Gen Failed:", aiError.message);
        
        const msg = (aiError.message || "").toLowerCase();
        const isQuota = aiError.status === 429 || msg.includes('429') || msg.includes('quota');
        
        // 5. Fallback: Return Mock Data
        // If Quota exceeded (429) OR Overloaded (503), we return mock so the app works.
        const mock = getMockData(cleanWord, isQuota ? 'quota' : 'overload');
        
        // Cache Mock
        cache.set(cacheKey, { data: mock, timestamp: Date.now(), isMock: true });
        
        return response.status(200).json(mock);
    }

  } catch (error: any) {
    console.error("Critical API Error:", error);
    // Even on critical error, try to return mock if we have the word
    if (request.query.word) {
        return response.status(200).json(getMockData(request.query.word as string));
    }
    return response.status(500).json({ error: "Internal Server Error" });
  }
}