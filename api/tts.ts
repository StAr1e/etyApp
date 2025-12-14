import { GoogleGenAI, Modality } from "@google/genai";

export default async function handler(request: any, response: any) {
  const apiKey = process.env.GEMINI_API_KEY;
  
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
    console.error("API Error:", error);
    return response.status(500).json({ error: error.message || "Failed to generate audio" });
  }
}