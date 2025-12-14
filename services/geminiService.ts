import { GoogleGenAI, Type, Schema, Modality } from "@google/genai";
import { WordData } from '../types';

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

// --- SHARED PROMPTS & SCHEMAS ---
const WORD_SCHEMA: Schema = {
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

// --- FETCH FUNCTIONS ---

export const fetchWordDetails = async (word: string): Promise<WordData> => {
  // HYBRID MODE: Direct Client Call (Only works if VITE_GEMINI_API_KEY is in .env)
  if (import.meta.env.DEV && import.meta.env.VITE_GEMINI_API_KEY) {
    console.log("⚠️ DEV MODE: Calling Gemini directly (Client-side)");
    try {
      const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `Analyze the word "${word}" for an etymology dictionary app. Provide precise, academic but accessible details.`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: WORD_SCHEMA,
          systemInstruction: "You are an expert etymologist."
        }
      });
      return JSON.parse(response.text!) as WordData;
    } catch (e: any) {
      console.error("Local Dev Error:", e);
      throw new Error(`Local Dev Error: ${e.message}`);
    }
  }

  // SERVER MODE: Call /api/details
  try {
    const response = await fetch(`/api/details?word=${encodeURIComponent(word)}`);
    
    // CRITICAL CHECK: Ensure we got JSON, not the HTML index page
    const contentType = response.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
       const text = await response.text();
       // If we got HTML, it means the API route failed and Vercel served the 404/index page
       if (text.includes("<!DOCTYPE html>") || text.includes("<html")) {
          throw new Error("API Route Missing: Please check Vercel logs/deployment.");
       }
       throw new Error(`Server returned non-JSON response (${response.status})`);
    }

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `Server Error (${response.status})`);
    }

    const data = await response.json();
    return data as WordData;
  } catch (error: any) {
    console.error("Error fetching word details:", error);
    throw new Error(error.message || "Failed to fetch word details");
  }
};

export const fetchWordSummary = async (word: string): Promise<string> => {
  if (import.meta.env.DEV && import.meta.env.VITE_GEMINI_API_KEY) {
    try {
      const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `Write a fascinating, storytelling-style deep dive summary about the hidden history and evolution of the word "${word}". Keep it under 150 words.`,
      });
      return response.text || "No summary available.";
    } catch (e) { return "Local Dev Summary Error"; }
  }

  try {
    const response = await fetch(`/api/summary?word=${encodeURIComponent(word)}`);
    if (!response.ok) throw new Error("Failed to fetch summary");
    const data = await response.json();
    return data.summary || "Could not generate summary.";
  } catch (error) {
    return "Sorry, I couldn't generate a summary right now.";
  }
};

export const fetchPronunciation = async (text: string): Promise<ArrayBuffer | null> => {
  if (import.meta.env.DEV && import.meta.env.VITE_GEMINI_API_KEY) {
    try {
      const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-preview-tts',
        contents: [{ parts: [{ text }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Fenrir' } } },
        },
      });
      const base64 = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      return base64 ? decodeAudio(base64) : null;
    } catch (e) { return null; }
  }

  try {
    const response = await fetch(`/api/tts?text=${encodeURIComponent(text)}`);
    if (!response.ok) return null;
    const data = await response.json();
    if (data.audio) return decodeAudio(data.audio);
    return null;
  } catch (error) {
    return null;
  }
};