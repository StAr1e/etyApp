import { GoogleGenAI } from "@google/genai";

// --- CONFIGURATION ---
const CACHE_VERSION = 'v1';
const TTL_SUCCESS = 24 * 60 * 60 * 1000;
const TTL_MOCK = 5 * 60 * 1000;

const cache = new Map<string, { data: string, timestamp: number, isMock: boolean }>();

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
    throw new Error("Model overloaded");
}

export default async function handler(request: any, response: any) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return response.status(500).json({ error: "Server Configuration Error" });

  const { word } = request.query;
  if (!word) return response.status(400).json({ error: "Word required" });

  const cleanWord = (word as string).trim().toLowerCase();
  const cacheKey = `${CACHE_VERSION}:summary:${cleanWord}`;

  // 1. Check Cache
  const cached = cache.get(cacheKey);
  if (cached) {
      const ttl = cached.isMock ? TTL_MOCK : TTL_SUCCESS;
      if (Date.now() - cached.timestamp < ttl) {
          return response.status(200).json({ summary: cached.data });
      }
  }

  const ai = new GoogleGenAI({ apiKey });

  try {
    const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Timeout")), 9500)
    );

    const generationPromise = generateWithRetry(ai, {
      model: 'gemini-2.5-flash',
      contents: `Story-style etymology summary of "${cleanWord}". Max 150 words. Focus on surprise.`,
      config: { maxOutputTokens: 300 }
    });

    const result: any = await Promise.race([generationPromise, timeoutPromise]);
    const text = result.text || "";

    // Success Cache
    if (cache.size > 100) cache.delete(cache.keys().next().value!);
    cache.set(cacheKey, { data: text, timestamp: Date.now(), isMock: false });

    return response.status(200).json({ summary: text });

  } catch (error: any) {
    console.error("Summary API Error:", error.message);
    
    // 2. Fallback Mock
    const mockSummary = `We are currently experiencing very high demand. The AI summary for "${cleanWord}" is temporarily unavailable. Please check back in a few minutes!`;
    
    // Short Cache for Mock
    cache.set(cacheKey, { data: mockSummary, timestamp: Date.now(), isMock: true });

    return response.status(200).json({ summary: mockSummary });
  }
}