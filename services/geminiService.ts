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
    // Limit cache size to 100 items to prevent localStorage quota issues
    if (map.size > 100) {
      const iter = map.keys();
      const head = iter.next().value;
      if (head) map.delete(head);
    }
    const obj = Object.fromEntries(map);
    localStorage.setItem(key, JSON.stringify(obj));
  } catch (e) {
    console.warn("Failed to save cache (likely quota exceeded)", e);
  }
};

// Initialize Caches
const wordCache = loadCache<WordData>('gemini_word_cache_v1');
const summaryCache = loadCache<string>('gemini_summary_cache_v1');
// Images are heavy, so we keep them in-memory only here. 
// Persistence is handled by the App's History mechanism which manages its own size.
const imageCache = new Map<string, string>(); 

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
  const cached = wordCache.get(cleanWord);
  if (cached) {
    console.log(`⚡ Cache hit for: ${cleanWord}`);
    return cached.data;
  }

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
          systemInstruction: "You are an expert etymologist.",
          maxOutputTokens: 1000, // Optimize speed
        }
      });
      const data = JSON.parse(response.text!) as WordData;
      
      // Save Cache
      wordCache.set(cleanWord, { data, timestamp: Date.now() });
      saveCache('gemini_word_cache_v1', wordCache);
      
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
    
    // Save Cache
    wordCache.set(cleanWord, { data, timestamp: Date.now() });
    saveCache('gemini_word_cache_v1', wordCache);

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
    // Construct Prompt for Pollinations
    // Extract a brief context string from the etymology (first 100 chars clean)
    const context = etymology.split('.')[0].substring(0, 100).replace(/[^a-zA-Z0-9 ]/g, ' ');
    
    // Style: "cute flat vector illustration... cartoon style, bright colors, educational illustration, clean background, modern infographic style"
    const prompt = `cute flat vector illustration representing the meaning of the word "${word}", context: ${context}, cartoon style, bright colors, educational illustration, clean background, modern infographic style`;
    
    const encodedPrompt = encodeURIComponent(prompt);
    // Pollinations URL (Free, no API key needed)
    const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=768&height=768&nologo=true&seed=${Math.floor(Math.random() * 1000)}`;

    const response = await fetch(url);
    if (!response.ok) throw new Error("Pollinations API Error");

    const blob = await response.blob();
    
    // Convert Blob to Base64
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (reader.result && typeof reader.result === 'string') {
          // Remove the "data:image/jpeg;base64," prefix as WordCard adds it
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

  } catch (e: any) {
    console.warn("Image generation failed:", e);
    return null;
  }
};

export const fetchWordSummary = async (word: string): Promise<string> => {
  const cleanWord = word.trim().toLowerCase();
  
  const cached = summaryCache.get(cleanWord);
  if (cached) {
    return cached.data;
  }

  // Local Dev Mode
  if (import.meta.env.DEV && import.meta.env.VITE_GEMINI_API_KEY) {
    try {
      const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `Write a fascinating, storytelling-style deep dive summary about the hidden history and evolution of the word "${word}". Keep it under 150 words.`,
        config: { maxOutputTokens: 300 }
      });
      const text = response.text || "No summary available.";
      
      summaryCache.set(cleanWord, { data: text, timestamp: Date.now() });
      saveCache('gemini_summary_cache_v1', summaryCache);
      
      return text;
    } catch (e: any) { 
        if (e.message?.includes('429') || e.message?.toLowerCase().includes('quota')) {
            return "Daily AI usage limit reached.";
        }
        return "Local Dev Summary Error"; 
    }
  }

  // Production / Server Mode
  try {
    const response = await fetch(`/api/summary?word=${encodeURIComponent(word)}`);
    
    // Check quota specifically
    if (response.status === 429) return "Daily AI usage limit reached. Please try again tomorrow.";
    
    // Validate Content-Type to avoid parsing HTML error pages (common in Vercel timeouts) as JSON
    const contentType = response.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
       console.error(`Summary API returned ${response.status} ${contentType}`);
       return "Service temporarily unavailable. Please try again later.";
    }

    if (!response.ok) {
        // Try to read specific error from server JSON
        let errMsg = "Failed to fetch summary";
        try {
            const errJson = await response.json();
            if (errJson.error) errMsg = errJson.error;
        } catch (e) {}
        throw new Error(errMsg);
    }
    
    const data = await response.json();
    const text = data.summary || "Could not generate summary.";
    
    summaryCache.set(cleanWord, { data: text, timestamp: Date.now() });
    saveCache('gemini_summary_cache_v1', summaryCache);
    
    return text;
  } catch (error: any) {
    console.error("Fetch Summary Error:", error);
    
    // Return the actual error message if it's a configuration/server issue
    if (error.message?.includes("Configuration") || error.message?.includes("API Key")) {
        return `⚠️ ${error.message}`;
    }
    if (error.message?.includes("limit") || error.message?.includes("quota")) {
        return "Daily AI usage limit reached. Please try again tomorrow.";
    }
    
    return "Sorry, I couldn't generate a summary right now.";
  }
};

export const fetchPronunciation = async (text: string): Promise<ArrayBuffer | null> => {
  // Audio is heavy, we don't cache it in memory to avoid OOM
  
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