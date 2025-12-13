import { GoogleGenAI, Type, Schema, Modality } from "@google/genai";
import { WordData } from '../types';

const apiKey = process.env.API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

// Helper to decode base64 audio
const decodeAudio = (base64: string): ArrayBuffer => {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
};

export const fetchWordDetails = async (word: string): Promise<WordData> => {
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

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: schema,
        systemInstruction: "You are an expert etymologist. Your goal is to explain word origins clearly. For the 'roots', trace back 2-3 steps (e.g. Middle English -> Old French -> Latin)."
      }
    });

    const text = response.text;
    if (!text) throw new Error("No data returned");
    return JSON.parse(text) as WordData;
  } catch (error) {
    console.error("Error fetching word details:", error);
    throw error;
  }
};

export const fetchWordSummary = async (word: string): Promise<string> => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Write a fascinating, storytelling-style deep dive summary about the hidden history and evolution of the word "${word}". Keep it under 150 words. Focus on the most surprising aspect.`,
    });
    return response.text || "Could not generate summary.";
  } catch (error) {
    console.error("Error fetching summary:", error);
    return "Sorry, I couldn't generate a summary right now.";
  }
};

export const fetchPronunciation = async (text: string): Promise<ArrayBuffer | null> => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-preview-tts',
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Fenrir' }, // Deep, authoritative voice
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (base64Audio) {
      return decodeAudio(base64Audio);
    }
    return null;
  } catch (error) {
    console.error("Error fetching audio:", error);
    return null;
  }
};