import { GoogleGenAI } from "@google/genai";

const cache = new Map<string, { data: string, timestamp: number }>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export default async function handler(request: any, response: any) {
  const apiKey = process.env.GEMINI_API_KEY;
  
  if (!apiKey) {
    return response.status(500).json({ error: "Server Configuration Error: API Key missing" });
  }

  const { word, etymology } = request.query;
  
  if (!word) {
    return response.status(400).json({ error: "Word parameter is required" });
  }

  const cleanWord = (word as string).trim().toLowerCase();

  // 1. Check Cache
  const cached = cache.get(cleanWord);
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
      return response.status(200).json({ image: cached.data });
  }

  const ai = new GoogleGenAI({ apiKey });

  try {
    // Construct a prompt that asks for an artistic representation
    // We use the etymology context to make the image more relevant to the origin
    const prompt = `Create a high-quality, artistic, surrealist illustration representing the concept and etymological origin of the word "${word}". Context: ${etymology || 'Abstract representation'}. No text in the image. Cinematic lighting, 8k resolution.`;

    const result = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [{ text: prompt }]
      },
      config: {
        // Nano banana models do not support responseMimeType or imageConfig for size in the same way as Pro
        // We rely on defaults or specific model capabilities. 
        // Note: SDK types might vary, but for 2.5-flash-image, we just send the prompt.
      }
    });

    let base64Image = null;

    // Iterate through parts to find the image
    if (result.candidates?.[0]?.content?.parts) {
      for (const part of result.candidates[0].content.parts) {
        if (part.inlineData && part.inlineData.data) {
          base64Image = part.inlineData.data;
          break;
        }
      }
    }

    if (!base64Image) {
        throw new Error("No image data generated.");
    }

    // 2. Set Cache
    if (cache.size > 50) {
        const oldestKey = cache.keys().next().value;
        if(oldestKey) cache.delete(oldestKey);
    }
    cache.set(cleanWord, { data: base64Image, timestamp: Date.now() });

    return response.status(200).json({ image: base64Image });
  } catch (error: any) {
    console.error("Image API Error:", error);
    
    const msg = error.message?.toLowerCase() || "";
    if (error.status === 429 || msg.includes('429') || msg.includes('quota')) {
       return response.status(429).json({ error: "Daily Image usage limit reached." });
    }

    return response.status(500).json({ error: error.message || "Failed to generate image" });
  }
}