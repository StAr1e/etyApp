import { GoogleGenAI } from "@google/genai";

const CACHE_VERSION = 'v3';
const TTL_SUCCESS = 24 * 60 * 60 * 1000;
const TTL_MOCK = 5 * 60 * 1000;

const cache = new Map<string, { data: string, timestamp: number, isMock: boolean }>();

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
            if ((status === 503 || msg.includes('503') || msg.includes('overloaded')) && i < retries - 1) {
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
  const apiKey = getRotatedApiKey();
  if (!apiKey) return response.status(500).json({ error: "Server Configuration Error" });

  const { word } = request.query;
  if (!word) return response.status(400).json({ error: "Word required" });

  const cleanWord = (word as string).trim().toLowerCase();
  const cacheKey = `${CACHE_VERSION}:summary:${cleanWord}`;

  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < (cached.isMock ? TTL_MOCK : TTL_SUCCESS)) {
    return response.status(200).json({ summary: cached.data });
  }

  const ai = new GoogleGenAI({ apiKey });

  try {
    const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Timeout")), 9500)
    );

    const generationPromise = generateWithRetry(ai, {
      model: 'gemini-3-flash-preview',
      contents: `Provide a clear, factual dictionary-style summary for the term "${cleanWord}".
      
      STRICT CONSTRAINTS:
      1. FORMAT: Start immediately with the definition. For example: "A computer is..."
      2. STYLE: Informative and factual (Encyclopedia style).
      3. LENGTH: Exactly one paragraph (3-5 sentences).
      4. COMPLETENESS: You MUST finish every sentence. Never stop mid-sentence.
      
      USER EXAMPLE:
      "A computer is an electronic device that processes data and performs tasks according to instructions. It consists of hardware and software, can store and retrieve information, and is used in work, education, communication, and entertainment."`,
      config: { 
          maxOutputTokens: 300,
          temperature: 0.4
      }
    });

    const result: any = await Promise.race([generationPromise, timeoutPromise]);
    let text = (result.text || "").trim();

    // Ensure the text isn't cut off
    if (!text.match(/[.!?]$/)) {
        const lastPunctuation = Math.max(text.lastIndexOf('.'), text.lastIndexOf('!'), text.lastIndexOf('?'));
        if (lastPunctuation !== -1) {
            text = text.substring(0, lastPunctuation + 1);
        }
    }

    if (cache.size > 200) cache.delete(cache.keys().next().value!);
    cache.set(cacheKey, { data: text, timestamp: Date.now(), isMock: false });

    return response.status(200).json({ summary: text });

  } catch (error: any) {
    console.error("Summary API Error:", error.message);
    const mockSummary = `The dictionary entry for "${cleanWord}" is currently being updated. Please try the Deep Dive again in a few seconds.`;
    return response.status(200).json({ summary: mockSummary });
  }
}