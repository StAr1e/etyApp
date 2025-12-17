import { GoogleGenAI, Type, Schema } from "@google/genai";
import { connectToDatabase, User } from '../lib/mongodb.js';

// --- CONFIGURATION ---
const CACHE_VERSION = 'v1'; 
const TTL_SUCCESS = 24 * 60 * 60 * 1000; 
const TTL_MOCK = 5 * 60 * 1000; 
const DAILY_LIMIT = 50;

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
    ].filter(k => !!k && k.length > 10);

    if (keys.length === 0) return null;
    return keys[Math.floor(Math.random() * keys.length)];
};

// --- MOCK DATA ---
const getMockData = (word: string, reason: 'overload' | 'quota' = 'overload') => ({
    word: word,
    phonetic: "/.../",
    partOfSpeech: "symbol/term",
    definition: reason === 'quota' 
        ? "Daily AI usage limit reached. Check back soon!" 
        : "AI servers are currently busy. This is a temporary placeholder.",
    etymology: "Origins are briefly obscured due to server load. Please refresh in a moment.",
    roots: [
        { term: "Retry", language: "Action", meaning: "Refresh soon" }
    ],
    examples: [`Searching for "${word}"...`],
    synonyms: ["Pending"],
    funFact: "Even symbols have long histories!",
    isMock: true,
    mockReason: reason
});

const generateWithRetry = async (ai: GoogleGenAI, params: any, retries = 3) => {
    for (let i = 0; i < retries; i++) {
        try {
            return await ai.models.generateContent(params);
        } catch (e: any) {
            const msg = (e.message || "").toLowerCase();
            const status = e.status;
            const isOverloaded = status === 503 || msg.includes('503') || msg.includes('overloaded');
            if (isOverloaded && i < retries - 1) {
                const delay = 800 * Math.pow(2, i); 
                await new Promise(r => setTimeout(r, delay));
                continue;
            }
            throw e;
        }
    }
    throw new Error("Model overloaded");
}

export default async function handler(request: any, response: any) {
  try {
    const apiKey = getRotatedApiKey();
    if (!apiKey) return response.status(500).json({ error: "Missing API Keys" });

    const { word, userId } = request.query;
    if (!word) return response.status(400).json({ error: "Word required" });

    const cleanWord = (word as string).trim().toLowerCase();
    const cacheKey = `${CACHE_VERSION}:details:${cleanWord}`;

    const cached = cache.get(cacheKey);
    if (cached) {
        const ttl = cached.isMock ? TTL_MOCK : TTL_SUCCESS;
        if (Date.now() - cached.timestamp < ttl) return response.status(200).json(cached.data);
    }

    if (userId) {
       try {
         const db = await connectToDatabase();
         if (db) {
             const user = await User.findOne({ userId: userId.toString() });
             if (user && user.searchHistory.filter((h: any) => h.timestamp > new Date().setHours(0,0,0,0)).length >= DAILY_LIMIT) {
                 return response.status(200).json(getMockData(cleanWord, 'quota'));
             }
         }
       } catch (dbErr) { console.warn("DB Limit Check Failed", dbErr); }
    }

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
            model: 'gemini-3-flash-preview',
            contents: `Analyze "${cleanWord}". If word, provide etymology. If symbol, explain history/usage. Deep but concise.`,
            config: {
                responseMimeType: 'application/json',
                responseSchema: schema,
                maxOutputTokens: 1000
            }
        });

        const parsedData = JSON.parse(result.text.replace(/^```(json)?/, '').replace(/```$/, ''));
        cache.set(cacheKey, { data: parsedData, timestamp: Date.now(), isMock: false });
        return response.status(200).json(parsedData);

    } catch (aiError: any) {
        console.error("AI Error:", aiError.message);
        const msg = (aiError.message || "").toLowerCase();
        const isQuota = aiError.status === 429 || msg.includes('429') || msg.includes('quota');
        const mock = getMockData(cleanWord, isQuota ? 'quota' : 'overload');
        cache.set(cacheKey, { data: mock, timestamp: Date.now(), isMock: true });
        return response.status(200).json(mock);
    }
  } catch (error: any) {
    if (request.query.word) return response.status(200).json(getMockData(request.query.word as string));
    return response.status(500).json({ error: "Internal Error" });
  }
}