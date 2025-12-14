import { GoogleGenAI } from "@google/genai";

export default async function handler(request: any, response: any) {
  const apiKey = process.env.GEMINI_API_KEY;
  
  if (!apiKey) {
    return response.status(500).json({ error: "Server Configuration Error: API Key missing" });
  }

  const { word } = request.query;
  
  if (!word) {
    return response.status(400).json({ error: "Word parameter is required" });
  }

  const ai = new GoogleGenAI({ apiKey });

  try {
    const result = await ai.models.generateContent({
      model: 'gemini-flash-latest',
      contents: `Write a fascinating, storytelling-style deep dive summary about the hidden history and evolution of the word "${word}". Keep it under 150 words. Focus on the most surprising aspect.`,
    });

    return response.status(200).json({ summary: result.text });
  } catch (error: any) {
    console.error("API Error:", error);
    
    const msg = error.message?.toLowerCase() || "";
    if (error.status === 429 || msg.includes('429') || msg.includes('quota') || msg.includes('exhausted')) {
       return response.status(429).json({ error: "Daily AI usage limit reached." });
    }

    return response.status(500).json({ error: error.message || "Failed to generate summary" });
  }
}