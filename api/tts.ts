import { GoogleGenAI, Modality } from "@google/genai";

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
  if (keys.length === 0) {
    return response.status(500).json({ error: "Server Configuration Error: API Keys missing" });
  }

  const { text } = request.query;
  if (!text) {
    return response.status(400).json({ error: "Text parameter is required" });
  }

  // Sequential retry through all keys if 429 occurs
  for (let i = 0; i < keys.length; i++) {
    const apiKey = keys[i];
    const ai = new GoogleGenAI({ apiKey });

    try {
      const result = await ai.models.generateContent({
        model: 'gemini-2.5-flash-preview-tts',
        contents: [{ parts: [{ text: text as string }] }],
        config: {
          systemInstruction: "You are a warm narrator for Ety.ai. Speak at a clear, comfortable pace. Use natural pauses.",
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
      }
    } catch (error: any) {
      const msg = error.message?.toLowerCase() || "";
      const isQuota = error.status === 429 || msg.includes('429') || msg.includes('quota');
      
      // If it's a quota error and we have more keys, continue to next key
      if (isQuota && i < keys.length - 1) {
        console.warn(`Key ${i+1} exhausted, trying next key...`);
        continue;
      }
      
      // If we've reached the last key and still have a quota error
      if (isQuota) {
        return response.status(429).json({ error: "Narrator is resting (Daily limit reached). Please try again later." });
      }
      
      return response.status(500).json({ error: error.message || "Failed to generate audio" });
    }
  }

  return response.status(429).json({ error: "All AI narrators are currently occupied. Please try later." });
}