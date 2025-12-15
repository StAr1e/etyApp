import { GoogleGenAI } from "@google/genai";

const cache = new Map<string, { data: string, timestamp: number }>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export default async function handler(request: any, response: any) {
  // Allow CORS
  response.setHeader('Access-Control-Allow-Credentials', true);
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  response.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (request.method === 'OPTIONS') {
    return response.status(200).end();
  }

  const apiKey = process.env.GEMINI_API_KEY;
  
  if (!apiKey) {
    console.error("API Key Missing");
    return response.status(500).json({ error: "Server Configuration Error: API Key missing" });
  }

  // Support both GET (query) and POST (body)
  const { word, etymology } = request.body && Object.keys(request.body).length > 0 ? request.body : request.query;
  
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
    const prompt = `Create a high-quality, artistic, surrealist illustration representing the concept and etymological origin of the word "${word}". Context: ${etymology ? etymology.substring(0, 300) : 'Abstract representation'}. The image should be a symbolic, visual interpretation without any text. Cinematic lighting, 8k resolution, photorealistic or highly detailed illustration style.`;

    // console.log("Generating image for:", word);

    const result = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [{ text: prompt }]
      },
      // No config for image size/mime type for this model as per docs
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
        // Log the full response for debugging (on server side)
        console.error("No image data in response:", JSON.stringify(result, null, 2));
        throw new Error("Model returned no image data.");
    }

    // 2. Set Cache
    if (cache.size > 50) {
        const oldestKey = cache.keys().next().value;
        if(oldestKey) cache.delete(oldestKey);
    }
    cache.set(cleanWord, { data: base64Image, timestamp: Date.now() });

    return response.status(200).json({ image: base64Image });
  } catch (error: any) {
    console.error("Image API Error for word:", word, error);
    
    const msg = error.message?.toLowerCase() || "";
    if (error.status === 429 || msg.includes('429') || msg.includes('quota')) {
       return response.status(429).json({ error: "Daily Image usage limit reached." });
    }

    // Safety filter error
    if (msg.includes("safety") || msg.includes("blocked")) {
        return response.status(400).json({ error: "Image generation blocked by safety filters." });
    }

    return response.status(500).json({ error: error.message || "Failed to generate image" });
  }
}