import { GoogleGenAI } from "@google/genai";

const CACHE_VERSION = 'v1';
const TTL_SUCCESS = 24 * 60 * 60 * 1000;
const TTL_MOCK = 5 * 60 * 1000;

const cache = new Map<string, { data: string, timestamp: number, isMock: boolean }>();

// --- KEY ROTATION ---
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

const generateWithRetry = async (ai: GoogleGenAI, params: any, retries = 3) => {
    for (let i = 0; i < retries; i++) {
        try {
            return await ai.models.generateContent(params);
        } catch (e: any) {
            const msg = (e.message || "").toLowerCase();
            const status = e.status;
            if (status === 429 || msg.includes('429') || msg.includes('quota')) throw e; 

            const isOverloaded = status === 503 || msg.includes('503') || msg.includes('overloaded');
            if (isOverloaded && i < retries - 1) {
                const delay = 1000 * Math.pow(2, i);
                await new Promise(r => setTimeout(r, delay));
                continue;
            }
            throw e;
        }
    }
    throw new Error("Model overloaded");
}

export default async function handler(request: any, response: any) {
  const apiKey = getRotatedApiKey();
  if (!apiKey) return response.status(500).json({ error: "Server Configuration Error" });

  const { word } = request.query;
  if (!word) return response.status(400).json({ error: "Word required" });

  const cleanWord = (word as string).trim().toLowerCase();
  const cacheKey = `${CACHE_VERSION}:summary:${cleanWord}`;

  const cached = cache.get(cacheKey);
  if (cached) {
      const ttl = cached.isMock ? TTL_MOCK : TTL_SUCCESS;
      if (Date.now() - cached.timestamp < ttl) {
          return response.status(200).json({ summary: cached.data });
      }
  }

  const ai = new GoogleGenAI({ apiKey });

  try {
    // Vercel Serverless (Free) has 10s timeout. We must respond before that.
    // 9.5s gives us a 500ms safety buffer.
    // We use Promise.race to ensure we don't crash hard.
    const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Timeout")), 9800)
    );

    const generationPromise = generateWithRetry(ai, {
      model: 'gemini-2.5-flash',
      contents: `Write a comprehensive, engaging deep-dive history for "${cleanWord}". 
      If it is a symbol (like @, &, #), explain its origins in manuscripts or typography and its modern evolution.
      If it is a word, tell the full story of its journey through languages.
      Structure it like a short blog post or story. 
      Aim for 300-500 words of rich detail.`,
      config: { 
          maxOutputTokens: 1000, // Increased from 300 to allow longer stories
          temperature: 0.8 
      }
    });

    const result: any = await Promise.race([generationPromise, timeoutPromise]);
    const text = result.text || "";

    if (cache.size > 100) cache.delete(cache.keys().next().value!);
    cache.set(cacheKey, { data: text, timestamp: Date.now(), isMock: false });

    return response.status(200).json({ summary: text });

  } catch (error: any) {
    console.error("Summary API Error:", error.message);
    const msg = (error.message || "").toLowerCase();
    
    // Fallback if timeout or error
    let mockSummary = `We are currently experiencing very high demand. The AI deep dive for "${cleanWord}" is temporarily unavailable.`;
    
    if (msg.includes("timeout")) {
        mockSummary = `The story of "${cleanWord}" is so long and complex that our system timed out while writing it! Please try again in a moment.`;
    }
    
    cache.set(cacheKey, { data: mockSummary, timestamp: Date.now(), isMock: true });
    return response.status(200).json({ summary: mockSummary });
  }
}