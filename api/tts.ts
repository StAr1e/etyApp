import { GoogleGenAI, Modality } from "@google/genai";

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

export default async function handler(request: any, response: any) {
  const apiKey = getRotatedApiKey();
  
  if (!apiKey) {
    return response.status(500).json({ error: "Server Configuration Error: API Key missing" });
  }

  const { text } = request.query;
  
  if (!text) {
    return response.status(400).json({ error: "Text parameter is required" });
  }

  const ai = new GoogleGenAI({ apiKey });

  try {
    const result = await ai.models.generateContent({
      model: 'gemini-2.5-flash-preview-tts',
      contents: [{ parts: [{ text: text as string }] }],
      config: {
        systemInstruction: "You are a warm and knowledgeable professional narrator for Ety.ai. Speak at a clear, comfortable pace. Use pauses between different sections of information (definition, origin, and facts) to ensure the listener can follow easily.",
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Fenrir' }, 
          },
        },
      },
    });

    const base64Audio = result.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    
    if (base64Audio) {
      return response.status(200).json({ audio: base64Audio });
    } else {
      return response.status(500).json({ error: "No audio data returned" });
    }

  } catch (error: any) {
    const msg = error.message?.toLowerCase() || "";
    if (error.status === 429 || msg.includes('429') || msg.includes('quota')) {
       return response.status(429).json({ error: "Daily AI usage limit reached." });
    }
    return response.status(500).json({ error: error.message || "Failed to generate audio" });
  }
}