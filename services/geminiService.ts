import { GoogleGenAI, Type, Schema, Modality } from "@google/genai";
import { WordData } from '../types';

// Fix for missing types in current environment
declare global {
  interface ImportMetaEnv {
    VITE_GEMINI_API_KEY?: string;
    DEV: boolean;
  }
  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
}

// --- CLIENT SIDE CACHE ---
// Simple in-memory cache to prevent re-fetching the same word in one session
const wordCache = new Map<string, WordData>();
const summaryCache = new Map<string, string>();

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
  const cleanWord = word.trim().toLowerCase();
  
  // 1. Check Cache
  if (wordCache.has(cleanWord)) {
    console.log(`⚡ Cache hit for: ${cleanWord}`);
    return wordCache.get(cleanWord)!;
  }

  // HYBRID MODE: Direct Client Call (Only works if VITE_GEMINI_API_KEY is in .env)
  if (import.meta.env.DEV && import.meta.env.VITE_GEMINI_API_KEY) {
    console.log("⚠️ DEV MODE: Calling Gemini directly (Client-side)");
    try {
      const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-flash-lite-latest',
        contents: `Analyze the word "${word}" for an etymology dictionary app. Provide precise, academic but accessible details.`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: WORD_SCHEMA,
          systemInstruction: "You are an expert etymologist."
        }
      });
      const data = JSON.parse(response.text!) as WordData;
      wordCache.set(cleanWord, data); // Save to cache
      return data;
    } catch (e: any) {
      console.error("Local Dev Error:", e);
      if (e.message?.includes('429') || e.message?.toLowerCase().includes('quota')) {
        throw new Error("Daily AI usage limit reached. Please try again tomorrow!");
      }
      throw new Error(`Local Dev Error: ${e.message}`);
    }
  }

  // SERVER MODE: Call /api/details
  try {
    const response = await fetch(`/api/details?word=${encodeURIComponent(word)}`);
    
    // Check quota before anything else
    if (response.status === 429) {
       throw new Error("Daily AI usage limit reached. Please try again tomorrow!");
    }

    // CRITICAL CHECK: Ensure we got JSON, not the HTML index page
    const contentType = response.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
       const text = await response.text();
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
    wordCache.set(cleanWord, data); // Save to cache
    return data as WordData;
  } catch (error: any) {
    console.error("Error fetching word details:", error);
    throw new Error(error.message || "Failed to fetch word details");
  }
};

export const fetchWordSummary = async (word: string): Promise<string> => {
  const cleanWord = word.trim().toLowerCase();
  
  if (summaryCache.has(cleanWord)) {
    return summaryCache.get(cleanWord)!;
  }

  if (import.meta.env.DEV && import.meta.env.VITE_GEMINI_API_KEY) {
    try {
      const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-flash-lite-latest',
        contents: `Write a fascinating, storytelling-style deep dive summary about the hidden history and evolution of the word "${word}". Keep it under 150 words.`,
      });
      const text = response.text || "No summary available.";
      summaryCache.set(cleanWord, text);
      return text;
    } catch (e: any) { 
        if (e.message?.includes('429') || e.message?.toLowerCase().includes('quota')) {
            return "Daily AI usage limit reached.";
        }
        return "Local Dev Summary Error"; 
    }
  }

  try {
    const response = await fetch(`/api/summary?word=${encodeURIComponent(word)}`);
    if (response.status === 429) return "Daily AI usage limit reached. Please try again tomorrow.";
    
    if (!response.ok) throw new Error("Failed to fetch summary");
    const data = await response.json();
    const text = data.summary || "Could not generate summary.";
    summaryCache.set(cleanWord, text);
    return text;
  } catch (error) {
    return "Sorry, I couldn't generate a summary right now.";
  }
};

export const fetchPronunciation = async (text: string): Promise<ArrayBuffer | null> => {
  // Audio is heavy, we don't cache it in memory to avoid OOM, browser cache handles the fetch call usually if headers are set, 
  // but since it's a POST/search query often, we just rely on browser or let it fetch.
  // We can add a simple blob cache if needed, but text-to-speech is less likely to be repeated instantly than text data.
  
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
    if (response.status === 429) return null; 
    
    if (!response.ok) return null;
    const data = await response.json();
    if (data.audio) return decodeAudio(data.audio);
    return null;
  } catch (error) {
    return null;
  }
};