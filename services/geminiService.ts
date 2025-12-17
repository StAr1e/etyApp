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

// --- CLIENT SIDE PERSISTENT CACHE ---
const CACHE_VERSION = 'v1'; 

// Helper to load map from local storage with expiry check (7 days)
const loadCache = <T>(key: string): Map<string, { data: T, timestamp: number }> => {
  try {
    const item = localStorage.getItem(key);
    if (item) {
      const parsed = JSON.parse(item);
      const now = Date.now();
      const validEntries = Object.entries(parsed).filter(([, val]: any) => {
        // Expire after 7 days
        return (now - (val.timestamp || 0)) < 7 * 24 * 60 * 60 * 1000;
      }) as [string, { data: T, timestamp: number }][];
      
      return new Map(validEntries);
    }
  } catch (e) {
    console.warn("Failed to load cache", e);
  }
  return new Map();
};

const saveCache = (key: string, map: Map<string, any>) => {
  try {
    if (map.size > 100) {
      const iter = map.keys();
      const head = iter.next().value;
      if (head) map.delete(head);
    }
    const obj = Object.fromEntries(map);
    localStorage.setItem(key, JSON.stringify(obj));
  } catch (e) {
    console.warn("Failed to save cache", e);
  }
};

// Initialize Caches
const wordCache = loadCache<WordData>(`gemini_word_cache_${CACHE_VERSION}`);
const summaryCache = loadCache<string>(`gemini_summary_cache_${CACHE_VERSION}`);
const imageCache = new Map<string, string>(); 

const decodeAudio = (base64: string): ArrayBuffer => {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
};

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
      description: "List of 2-3 ancestral roots."
    },
    examples: { type: Type.ARRAY, items: { type: Type.STRING } },
    synonyms: { type: Type.ARRAY, items: { type: Type.STRING } },
    funFact: { type: Type.STRING, description: "A short, surprising trivia fact." },
  },
  required: ["word", "phonetic", "definition", "etymology", "roots", "examples", "synonyms", "funFact"]
};

// --- FETCH FUNCTIONS ---

export const fetchWordDetails = async (word: string, userId?: number): Promise<WordData> => {
  // Normalize Key: Version + Lowercase
  const cleanWord = word.trim().toLowerCase();
  const cacheKey = `${CACHE_VERSION}:${cleanWord}`;
  
  // 1. Check Cache
  const cached = wordCache.get(cacheKey);
  if (cached) {
    console.log(`⚡ Cache hit for: ${cleanWord}`);
    return cached.data;
  }

  // HYBRID MODE: Client-side Dev
  if (import.meta.env.DEV && import.meta.env.VITE_GEMINI_API_KEY) {
    try {
      const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `Analyze "${word}" for an etymology dictionary app.`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: WORD_SCHEMA,
          maxOutputTokens: 1000,
        }
      });
      const data = JSON.parse(response.text!) as WordData;
      
      wordCache.set(cacheKey, { data, timestamp: Date.now() });
      saveCache(`gemini_word_cache_${CACHE_VERSION}`, wordCache);
      
      return data;
    } catch (e: any) {
       // Mock fallback for Dev
       if (e.message?.includes('429')) throw new Error("Daily limit reached");
       throw e;
    }
  }

  // SERVER MODE
  try {
    const response = await fetch(`/api/details?word=${encodeURIComponent(word)}&userId=${userId || ''}`);
    
    // Check quota specifically
    if (response.status === 429) {
       let msg = "Daily AI usage limit reached. Please try again tomorrow!";
       try { const json = await response.json(); if (json.error) msg = json.error; } catch {}
       throw new Error(msg);
    }

    const data = await response.json();
    
    // Note: The server might return Mock Data if overloaded. 
    // We cache it anyway, but rely on the Server's short TTL next time we fetch.
    // Client-side cache is longer (7 days) so effectively if we cache a Mock here,
    // the user sees the Mock for 7 days unless they clear cache.
    // OPTIONAL: Check if data.isMock is true and do not cache in localStorage if desired.
    
    if (!(data as any).isMock) {
        wordCache.set(cacheKey, { data, timestamp: Date.now() });
        saveCache(`gemini_word_cache_${CACHE_VERSION}`, wordCache);
    }

    return data as WordData;
  } catch (error: any) {
    console.error("Error fetching word details:", error);
    throw new Error(error.message || "Failed to fetch word details");
  }
};

export const fetchWordImage = async (word: string, etymology: string): Promise<string | null> => {
  const cleanWord = word.trim().toLowerCase();
  if (imageCache.has(cleanWord)) return imageCache.get(cleanWord)!;

  try {
    const context = etymology.split('.')[0].substring(0, 100).replace(/[^a-zA-Z0-9 ]/g, ' ');
    const prompt = `cute flat vector illustration representing the meaning of the word "${word}", context: ${context}, cartoon style, bright colors, educational illustration, clean background, modern infographic style`;
    const encodedPrompt = encodeURIComponent(prompt);
    const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=768&height=768&nologo=true&seed=${Math.floor(Math.random() * 1000)}`;

    const response = await fetch(url);
    if (!response.ok) throw new Error("Pollinations API Error");

    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (reader.result && typeof reader.result === 'string') {
          const base64 = reader.result.split(',')[1];
          imageCache.set(cleanWord, base64);
          resolve(base64);
        } else {
          resolve(null);
        }
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    return null;
  }
};

export const fetchWordSummary = async (word: string): Promise<string> => {
  const cleanWord = word.trim().toLowerCase();
  const cacheKey = `${CACHE_VERSION}:${cleanWord}`;
  
  const cached = summaryCache.get(cacheKey);
  if (cached) return cached.data;

  // Local Dev
  if (import.meta.env.DEV && import.meta.env.VITE_GEMINI_API_KEY) {
    try {
      const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `Story-style etymology summary of "${word}". Max 150 words.`,
        config: { maxOutputTokens: 300 }
      });
      const text = response.text || "No summary available.";
      summaryCache.set(cacheKey, { data: text, timestamp: Date.now() });
      saveCache(`gemini_summary_cache_${CACHE_VERSION}`, summaryCache);
      return text;
    } catch (e) { return "Summary unavailable in Dev Mode."; }
  }

  // Server
  try {
    const response = await fetch(`/api/summary?word=${encodeURIComponent(word)}`);
    if (response.status === 429) return "Daily usage limit reached.";
    
    const data = await response.json();
    const text = data.summary || "Could not generate summary.";
    
    // Only cache if not mock, or if you want to persist the mock
    summaryCache.set(cacheKey, { data: text, timestamp: Date.now() });
    saveCache(`gemini_summary_cache_${CACHE_VERSION}`, summaryCache);
    
    return text;
  } catch (error) {
    return "Summary unavailable.";
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
    return data.audio ? decodeAudio(data.audio) : null;
  } catch (error) {
    return null;
  }
};