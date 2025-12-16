import { GoogleGenAI } from "@google/genai";

const cache = new Map<string, { data: string, timestamp: number }>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export default async function handler(request: any, response: any) {
  const apiKey = process.env.GEMINI_API_KEY;
  
  if (!apiKey) {
    return response.status(500).json({ error: "Server Configuration Error: API Key missing" });
  }

  const { word } = request.query;
  
  if (!word) {
    return response.status(400).json({ error: "Word parameter is required" });
  }

  const cleanWord = (word as string).trim().toLowerCase();

  // 1. Check Cache
  const cached = cache.get(cleanWord);
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
      return response.status(200).json({ summary: cached.data });
  }

  const ai = new GoogleGenAI({ apiKey });

  try {
    const result = await ai.models.generateContent({
      model: 'gemini-flash-lite-latest',
      contents: `Story-style etymology summary of "${word}". Max 150 words. Focus on surprise.`,
      config: { maxOutputTokens: 300 }
    });
    
    const text = result.text || "";

    // 2. Set Cache
    if (cache.size > 100) {
        const oldestKey = cache.keys().next().value;
        if(oldestKey) cache.delete(oldestKey);
    }
    cache.set(cleanWord, { data: text, timestamp: Date.now() });

    return response.status(200).json({ summary: text });
  } catch (error: any) {
    console.error("API Error:", error);
    
    const msg = error.message?.toLowerCase() || "";
    if (error.status === 429 || msg.includes('429') || msg.includes('quota') || msg.includes('exhausted')) {
       return response.status(429).json({ error: "Daily AI usage limit reached." });
    }

    return response.status(500).json({ error: error.message || "Failed to generate summary" });
  }
}