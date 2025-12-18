import { GoogleGenAI } from "@google/genai";

const CACHE_VERSION = 'v5';
const TTL_SUCCESS = 24 * 60 * 60 * 1000;
const TTL_MOCK = 5 * 60 * 1000;

const cache = new Map<string, { data: string, timestamp: number, isMock: boolean }>();

const getApiKeys = () => {
    return [
        process.env.GEMINI_API_KEY,
        process.env.GEMINI_API_KEY_2,
        process.env.GEMINI_API_KEY_3,
        process.env.GEMINI_API_KEY_4,
        process.env.GEMINI_API_KEY_5
    ].filter(k => !!k && k.length > 10) as string[];
};

export default async function handler(request: any, response: any) {
  const keys = getApiKeys();
  if (keys.length === 0) return response.status(500).json({ error: "Server Configuration Error" });

  const { word } = request.query;
  if (!word) return response.status(400).json({ error: "Word required" });

  const cleanWord = (word as string).trim().toLowerCase();
  const cacheKey = `${CACHE_VERSION}:summary:${cleanWord}`;

  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < (cached.isMock ? TTL_MOCK : TTL_SUCCESS)) {
    return response.status(200).json({ summary: cached.data });
  }

  for (let i = 0; i < keys.length; i++) {
    const apiKey = keys[i];
    const ai = new GoogleGenAI({ apiKey });

    try {
      const result = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Provide a clear, factual dictionary-style summary for the term "${cleanWord}".
       "`,
        config: { 
            maxOutputTokens: 1000,
            temperature: 0.3
        }
      });

      let text = (result.text || "").trim();

      // Clean up truncation if necessary
      if (!text.match(/[.!?]$/)) {
        const lastPunctuation = Math.max(text.lastIndexOf('.'), text.lastIndexOf('!'), text.lastIndexOf('?'));
        if (lastPunctuation !== -1) text = text.substring(0, lastPunctuation + 1);
      }

      if (cache.size > 200) cache.delete(cache.keys().next().value!);
      cache.set(cacheKey, { data: text, timestamp: Date.now(), isMock: false });

      return response.status(200).json({ summary: text });

    } catch (error: any) {
      const msg = (error.message || "").toLowerCase();
      const isQuota = error.status === 429 || msg.includes('429') || msg.includes('quota');
      
      if (isQuota && i < keys.length - 1) {
        continue;
      }

      console.error("Summary API Error:", error.message);
      const mockSummary = `The comprehensive dictionary entry for "${cleanWord}" is currently being indexed. Our AI scribes have reached their daily limit; please try again shortly for the full deep dive.`;
      return response.status(200).json({ summary: mockSummary });
    }
  }
}