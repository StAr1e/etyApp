
import { GoogleGenAI, Type, Schema } from "@google/genai";
import { connectToDatabase, User } from '../lib/mongodb.js';

// --- CONFIGURATION ---
const CACHE_VERSION = 'v3'; 
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
const getMockData = (word: string, reason: 'overload' | 'quota' | 'unknown' = 'overload') => {
    const data: any = {
        word: word,
        phonetic: "/.../",
        partOfSpeech: reason === 'unknown' ? "unknown" : "symbol/term",
        definition: "",
        etymology: "",
        roots: [],
        examples: [],
        synonyms: [],
        funFact: "",
        isMock: true,
        mockReason: reason
    };

    if (reason === 'quota') {
        data.definition = "Daily AI usage limit reached. Our scribes are taking a break!";
        data.etymology = "The history of this word is temporarily locked in the archives.";
        data.funFact = "Check back tomorrow to unlock the full deep dive!";
    } else if (reason === 'unknown') {
        data.definition = `We couldn't find a historical record for "${word}". It might be a brand new invention or a very creative typo!`;
        data.etymology = "This term is currently a linguistic mystery. Its origins are yet to be written.";
        data.funFact = "Shakespeare invented over 1,700 words. Maybe this is your contribution to the language?";
    } else {
        data.definition = "The AI servers are currently busy thinking. This is a temporary placeholder.";
        data.etymology = "Origins are briefly obscured. Please refresh in a moment.";
        data.funFact = "Refreshing often clears the digital fog!";
    }

    return data;
};

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
        correctedFrom: { type: Type.STRING, description: "If the user provided a misspelled word, put the original misspelling here. Otherwise leave empty." },
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
        isUnknown: { type: Type.BOOLEAN, description: "True if the word is total gibberish and has no meaning." }
      },
      required: ["word", "phonetic", "definition", "etymology", "roots", "examples", "synonyms", "funFact"]
    };

    try {
        const result: any = await generateWithRetry(ai, {
            model: 'gemini-3-flash-preview',
            contents: `Analyze the term "${cleanWord}". 
            
            STRICT SPELLING RULES:
            1. If "${cleanWord}" is an obvious typo of a common word (e.g. "galaxt" -> "galaxy", "speling" -> "spelling"), provide the correct spelling in the "word" field and set "correctedFrom" to "${cleanWord}".
            2. If it is a real slang word or a less common but correct term, keep it as is.
            3. GIBBERISH: If the word is total nonsense (e.g. "xhqkpz"), set 'isUnknown' to true.
            
            Be deep but concise. Format strictly as JSON.`,
            config: {
                responseMimeType: 'application/json',
                responseSchema: schema,
                maxOutputTokens: 1000
            }
        });

        const parsedData = JSON.parse(result.text.replace(/^```(json)?/, '').replace(/```$/, ''));
        
        if (parsedData.isUnknown) {
            const unknownMock = getMockData(cleanWord, 'unknown');
            cache.set(cacheKey, { data: unknownMock, timestamp: Date.now(), isMock: true });
            return response.status(200).json(unknownMock);
        }

        // Final check: if word changed but correctedFrom wasn't set, set it manually
        if (parsedData.word.toLowerCase() !== cleanWord && !parsedData.correctedFrom) {
            parsedData.correctedFrom = cleanWord;
        }

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
