import { GoogleGenAI } from "@google/genai";

const cache = new Map<string, { data: string, timestamp: number }>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// Helper to retry generation on 503/Overloaded errors
const generateWithRetry = async (ai: GoogleGenAI, params: any, retries = 3) => {
    for (let i = 0; i < retries; i++) {
        try {
            return await ai.models.generateContent(params);
        } catch (e: any) {
            const msg = (e.message || "").toLowerCase();
            const isOverloaded = msg.includes('503') || msg.includes('overloaded') || msg.includes('unavailable');
            
            if (isOverloaded && i < retries - 1) {
                // Exponential backoff: 1s, 2s, 4s...
                const delay = 1000 * Math.pow(2, i);
                console.log(`Summary Gen Overloaded (Attempt ${i+1}/${retries}). Retrying...`);
                await new Promise(r => setTimeout(r, delay));
                continue;
            }
            throw e;
        }
    }
    throw new Error("Model overloaded after retries");
}

export default async function handler(request: any, response: any) {
  const apiKey = process.env.GEMINI_API_KEY;
  
  if (!apiKey) {
    return response.status(500).json({ 
        error: "Server Configuration Error: GEMINI_API_KEY is missing. Please add it to your Vercel Environment Variables." 
    });
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
    // Wrap Gemini call in a timeout promise to prevent Vercel 504 HTML errors
    const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Timeout: AI generation took too long.")), 9500)
    );

    const generationPromise = generateWithRetry(ai, {
      model: 'gemini-2.5-flash',
      contents: `Story-style etymology summary of "${word}". Max 150 words. Focus on surprise.`,
      config: { maxOutputTokens: 300 }
    });

    // Race the generation against the timeout
    const result: any = await Promise.race([generationPromise, timeoutPromise]);
    
    const text = result.text || "";

    // 2. Set Cache
    if (cache.size > 100) {
        const oldestKey = cache.keys().next().value;
        if(oldestKey) cache.delete(oldestKey);
    }
    cache.set(cleanWord, { data: text, timestamp: Date.now() });

    return response.status(200).json({ summary: text });
  } catch (error: any) {
    console.error("Summary API Error:", error);
    
    // UNWRAP ERROR: Sometimes the error message is a JSON string from the SDK
    let readableMessage = error.message || "Internal Server Error";
    if (typeof readableMessage === 'string' && readableMessage.trim().startsWith('{')) {
        try {
            const parsed = JSON.parse(readableMessage);
            if (parsed.error && parsed.error.message) {
                readableMessage = parsed.error.message;
            }
        } catch(e) {}
    }

    const msg = readableMessage.toLowerCase();
    
    // Handle Quota Limits (429)
    if (error.status === 429 || msg.includes('429') || msg.includes('quota') || msg.includes('exhausted')) {
       return response.status(429).json({ error: "Daily AI usage limit reached." });
    }

    // Handle Overloaded (503)
    if (error.status === 503 || msg.includes('503') || msg.includes('overloaded') || msg.includes('unavailable')) {
        return response.status(503).json({ error: "The AI model is currently overloaded. Please try again in a moment." });
    }

    // Handle Timeouts specially
    if (msg.includes("timeout")) {
        return response.status(504).json({ error: "AI generation timed out. Please try again." });
    }

    return response.status(500).json({ error: readableMessage || "Failed to generate summary" });
  }
}