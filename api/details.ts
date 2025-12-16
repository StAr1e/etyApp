import { GoogleGenAI, Type, Schema } from "@google/genai";

// Simple in-memory cache
const cache = new Map<string, { data: any, timestamp: number }>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// Helper to retry generation on 503/Overloaded errors
const generateWithRetry = async (ai: GoogleGenAI, params: any, retries = 3) => {
    for (let i = 0; i < retries; i++) {
        try {
            return await ai.models.generateContent(params);
        } catch (e: any) {
            const msg = (e.message || "").toLowerCase();
            // Check for 503 Service Unavailable or Overloaded
            // Sometimes the error message is a JSON string containing code 503
            const isOverloaded = msg.includes('503') || msg.includes('overloaded') || msg.includes('unavailable');
            
            if (isOverloaded && i < retries - 1) {
                // Exponential backoff: 1s, 2s, 4s...
                const delay = 1000 * Math.pow(2, i);
                console.log(`AI Overloaded (Attempt ${i+1}/${retries}). Retrying in ${delay}ms...`);
                await new Promise(r => setTimeout(r, delay));
                continue;
            }
            throw e;
        }
    }
    throw new Error("Model overloaded after retries"); // Should be caught by caller
}

export default async function handler(request: any, response: any) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    
    if (!apiKey) {
      console.error("API Key Missing");
      return response.status(500).json({ error: "Configuration Error: GEMINI_API_KEY is missing in Vercel." });
    }

    const { word } = request.query;
    
    if (!word) {
      return response.status(400).json({ error: "Word parameter is required" });
    }

    const cleanWord = (word as string).trim().toLowerCase();

    // 1. Check Cache
    const cached = cache.get(cleanWord);
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
        return response.status(200).json(cached.data);
    }

    // 2. Initialize Gemini
    const ai = new GoogleGenAI({ apiKey });

    const schema: Schema = {
      type: Type.OBJECT,
      properties: {
        word: { type: Type.STRING },
        phonetic: { type: Type.STRING },
        partOfSpeech: { type: Type.STRING },
        definition: { type: Type.STRING },
        etymology: { type: Type.STRING, description: "A concise paragraph explaining the origin history." },
        roots: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              term: { type: Type.STRING },
              language: { type: Type.STRING },
              meaning: { type: Type.STRING },
            }
          },
          description: "List of 2-3 ancestral roots."
        },
        examples: { type: Type.ARRAY, items: { type: Type.STRING } },
        synonyms: { type: Type.ARRAY, items: { type: Type.STRING } },
        funFact: { type: Type.STRING, description: "A short, surprising trivia fact." },
      },
      required: ["word", "phonetic", "definition", "etymology", "roots", "examples", "synonyms", "funFact"]
    };

    const prompt = `Analyze "${word}" for etymology app. Precise, concise details.`;

    // Use retry wrapper
    const result: any = await generateWithRetry(ai, {
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: schema,
        systemInstruction: "Expert etymologist. Concise.",
        maxOutputTokens: 1000 // Performance Limit
      }
    });

    let text = result.text;
    if (!text) {
        throw new Error("No text returned from AI model.");
    }

    text = text.trim();
    if (text.startsWith('```')) {
        text = text.replace(/^```(json)?/, '').replace(/```$/, '');
    }
    
    try {
        const parsedData = JSON.parse(text);
        
        // 3. Save to Cache
        if (cache.size > 100) {
            // Prevent memory leak by clearing old cache if too big
            const oldestKey = cache.keys().next().value;
            if (oldestKey) cache.delete(oldestKey);
        }
        cache.set(cleanWord, { data: parsedData, timestamp: Date.now() });

        return response.status(200).json(parsedData);
    } catch (parseError) {
        console.error("JSON Parse Error:", text);
        return response.status(500).json({ error: "Failed to parse AI response.", details: text.substring(0, 100) });
    }

  } catch (error: any) {
    console.error("Critical API Error:", error);

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

    // HANDLE QUOTA (429)
    if (error.status === 429 || msg.includes('429') || msg.includes('quota') || msg.includes('exhausted')) {
       return response.status(429).json({ error: "Daily AI usage limit reached. Please try again tomorrow!" });
    }

    // HANDLE OVERLOAD (503)
    if (error.status === 503 || msg.includes('503') || msg.includes('overloaded') || msg.includes('unavailable')) {
        return response.status(503).json({ error: "The AI model is currently overloaded. Please try again in a moment." });
    }

    return response.status(500).json({ 
        error: readableMessage,
        timestamp: new Date().toISOString()
    });
  }
}