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
    // Vercel Serverless (Free) has 10s timeout. 
    // We aim for generation under 5s.
    const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Timeout")), 9500)
    );

    const generationPromise = generateWithRetry(ai, {
      model: 'gemini-2.5-flash',
      contents: `Write a fun, fast-paced, and engaging etymology story for "${cleanWord}". 
      
      Instructions:
      1. If it's a symbol (like @, &, #), explain its origin (e.g., monks, scribes, or keyboards).
      2. If it's a word, trace its journey.
      3. Keep it **under 200 words** to ensure it loads instantly.
      4. Focus on the most surprising twist or "aha!" moment.
      5. Do not be dry. Be a storyteller.`,
      config: { 
          maxOutputTokens: 600, // Reduced from 1000 to prevent timeouts. 600 tokens is ~250 words.
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
        mockSummary = `The story of "${cleanWord}" is complex, but our scribe took too long to write it! Please try again in a moment.`;
    }
    
    cache.set(cacheKey, { data: mockSummary, timestamp: Date.now(), isMock: true });
    return response.status(200).json({ summary: mockSummary });
  }
}