import { GoogleGenAI, Type, Schema } from "@google/genai";

export default async function handler(request: any, response: any) {
  // 1. Top-level Error Handling to prevent 500 HTML crashes
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

    // 2. Initialize inside try/catch
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
          description: "List of 2-3 ancestral roots (e.g., Latin, Greek, Old English) leading to this word."
        },
        examples: { type: Type.ARRAY, items: { type: Type.STRING } },
        synonyms: { type: Type.ARRAY, items: { type: Type.STRING } },
        funFact: { type: Type.STRING, description: "A short, surprising trivia fact about the word." },
      },
      required: ["word", "phonetic", "definition", "etymology", "roots", "examples", "synonyms", "funFact"]
    };

    const prompt = `Analyze the word "${word}" for an etymology dictionary app. Provide precise, academic but accessible details. If the word is misspelled, analyze the closest correct word.`;

    const result = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: schema,
        systemInstruction: "You are an expert etymologist. Your goal is to explain word origins clearly."
      }
    });

    let text = result.text;
    if (!text) {
        throw new Error("No text returned from AI model.");
    }

    // Aggressive cleanup for JSON
    text = text.trim();
    // Remove markdown code blocks if present
    if (text.startsWith('```')) {
        text = text.replace(/^```(json)?/, '').replace(/```$/, '');
    }
    
    try {
        const parsedData = JSON.parse(text);
        return response.status(200).json(parsedData);
    } catch (parseError) {
        console.error("JSON Parse Error:", text);
        return response.status(500).json({ error: "Failed to parse AI response. The model returned invalid JSON.", details: text.substring(0, 100) });
    }

  } catch (error: any) {
    console.error("Critical API Error:", error);
    // Ensure we send JSON even on crash
    return response.status(500).json({ 
        error: error.message || "Internal Server Error",
        timestamp: new Date().toISOString()
    });
  }
}