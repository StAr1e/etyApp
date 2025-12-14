
import 'dotenv/config';
import express from 'express';
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import { Telegraf, Markup } from 'telegraf';
import { GoogleGenAI } from '@google/genai';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.GEMINI_API_KEY;

// --- DATABASE IMPLEMENTATION (File-Based for Persistence) ---
// In a production environment like Heroku/Render/VPS, this file persists.
// For Vercel, you would replace this section with MongoDB or Postgres connection.
const DB_FILE = path.join(__dirname, 'gamification.db.json');

// DB Structure: { "userId": { stats: {...}, profile: { name, photo } } }
let db = {};

const loadDb = () => {
    if (fs.existsSync(DB_FILE)) {
        try {
            db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
        } catch (e) {
            console.error("Failed to load DB", e);
            db = {};
        }
    }
};
loadDb();

const saveDb = () => {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
    } catch (e) {
        console.error("Failed to save DB", e);
    }
};

// --- CACHE SETUP ---
const wordCache = new Map();
const summaryCache = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000;

const getFromCache = (cache, key) => {
    const item = cache.get(key);
    if (item && Date.now() - item.timestamp < CACHE_TTL) return item.data;
    return null;
};

const setCache = (cache, key, data) => {
    if (cache.size > 200) {
        const firstKey = cache.keys().next().value;
        cache.delete(firstKey);
    }
    cache.set(key, { data, timestamp: Date.now() });
};

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'dist')));

// --- GEMINI ENDPOINTS ---
const ai = API_KEY ? new GoogleGenAI({ apiKey: API_KEY }) : null;

app.get('/api/details', async (req, res) => {
    if (!ai) return res.status(500).json({ error: "Server missing API Key" });
    const { word } = req.query;
    if (!word) return res.status(400).json({ error: "Word required" });

    const cleanWord = word.trim().toLowerCase();
    const cached = getFromCache(wordCache, cleanWord);
    if (cached) return res.json(cached);

    const schema = {
        type: "OBJECT",
        properties: {
            word: { type: "STRING" },
            phonetic: { type: "STRING" },
            partOfSpeech: { type: "STRING" },
            definition: { type: "STRING" },
            etymology: { type: "STRING" },
            roots: { type: "ARRAY", items: { type: "OBJECT", properties: { term: { type: "STRING" }, language: { type: "STRING" }, meaning: { type: "STRING" } } } },
            examples: { type: "ARRAY", items: { type: "STRING" } },
            synonyms: { type: "ARRAY", items: { type: "STRING" } },
            funFact: { type: "STRING" },
        },
        required: ["word", "phonetic", "definition", "etymology", "roots", "examples", "synonyms", "funFact"]
    };

    try {
        const result = await ai.models.generateContent({
            model: 'gemini-flash-lite-latest',
            contents: `Analyze "${word}" for etymology app.`,
            config: { responseMimeType: 'application/json', responseSchema: schema }
        });
        const data = JSON.parse(result.text);
        setCache(wordCache, cleanWord, data);
        res.json(data);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/summary', async (req, res) => {
    if (!ai) return res.status(500).json({ error: "Server missing API Key" });
    const { word } = req.query;
    if (!word) return res.status(400).json({ error: "Word required" });

    const cleanWord = word.trim().toLowerCase();
    const cached = getFromCache(summaryCache, cleanWord);
    if (cached) return res.json({ summary: cached });

    try {
        const result = await ai.models.generateContent({
            model: 'gemini-flash-lite-latest',
            contents: `Story-style etymology summary of "${word}". Max 150 words.`,
        });
        const text = result.text;
        setCache(summaryCache, cleanWord, text);
        res.json({ summary: text });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/tts', async (req, res) => {
    if (!ai) return res.status(500).json({ error: "Server missing API Key" });
    const { text } = req.query;
    if (!text) return res.status(400).json({ error: "Text required" });

    try {
        const result = await ai.models.generateContent({
            model: 'gemini-2.5-flash-preview-tts',
            contents: [{ parts: [{ text }] }],
            config: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Fenrir' } } } },
        });
        const audio = result.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if(audio) res.json({ audio });
        else res.status(500).json({ error: "No audio" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// --- GAMIFICATION ENDPOINTS (PROPER DB) ---

const XP_ACTIONS = { SEARCH: 15, SUMMARY: 30, SHARE: 50, DAILY_VISIT: 100 };

const INITIAL_STATS = {
  xp: 0,
  level: 1,
  wordsDiscovered: 0,
  summariesGenerated: 0,
  shares: 0,
  lastVisit: 0,
  currentStreak: 1,
  badges: []
};

// 1. Get User Stats
app.get('/api/gamification', (req, res) => {
    const { userId, name, photo } = req.query;
    if (!userId) return res.status(400).json({ error: "userId required" });

    const idStr = userId.toString();
    
    // Initialize or Retrieve
    let userData = db[idStr] || { 
        stats: { ...INITIAL_STATS, lastVisit: Date.now() },
        profile: { name: name || 'Explorer', photo: photo || '' }
    };

    // Update Profile Info if provided (Syncing latest Telegram data)
    if (name) userData.profile.name = name;
    if (photo) userData.profile.photo = photo;

    let stats = userData.stats;

    // Daily Streak Check
    const last = new Date(stats.lastVisit);
    const now = new Date();
    const isSameDay = last.getDate() === now.getDate() && last.getMonth() === now.getMonth() && last.getFullYear() === now.getFullYear();
    
    if (!isSameDay && stats.lastVisit > 0) {
        const diffTime = Math.abs(now.getTime() - last.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
        if (diffDays <= 2) {
            stats.currentStreak += 1;
            stats.xp += XP_ACTIONS.DAILY_VISIT;
        } else {
            stats.currentStreak = 1;
        }
        stats.lastVisit = Date.now();
    } else if (stats.lastVisit === 0) {
        stats.lastVisit = Date.now();
    }

    // Save state back to DB
    userData.stats = stats;
    db[idStr] = userData;
    saveDb();

    res.json(stats);
});

// 2. Track Action
app.post('/api/gamification', (req, res) => {
    const { userId, action } = req.body;
    if (!userId || !action) return res.status(400).json({ error: "Missing data" });

    const idStr = userId.toString();
    let userData = db[idStr] || { stats: { ...INITIAL_STATS }, profile: { name: 'Unknown', photo: '' } };
    let stats = userData.stats;
    const newBadges = [];
    const previousLevel = stats.level;

    // Update Stats
    stats.xp += (XP_ACTIONS[action] || 0);
    if (action === 'SEARCH') stats.wordsDiscovered++;
    if (action === 'SUMMARY') stats.summariesGenerated++;
    if (action === 'SHARE') stats.shares++;

    // Calculate Level
    stats.level = 1 + Math.floor(Math.sqrt(stats.xp / 50));

    // Check Badges
    const addBadge = (id, condition) => {
        if (condition && !stats.badges.includes(id)) {
            stats.badges.push(id);
            newBadges.push(id);
        }
    };
    addBadge('first_search', stats.wordsDiscovered >= 1);
    addBadge('explorer_10', stats.wordsDiscovered >= 10);
    addBadge('linguist_50', stats.wordsDiscovered >= 50);
    addBadge('deep_diver', stats.summariesGenerated >= 5);
    addBadge('social_butterfly', stats.shares >= 3);
    addBadge('daily_streak_3', stats.currentStreak >= 3);

    stats.lastVisit = Date.now();
    
    // Save
    db[idStr] = userData;
    saveDb();

    res.json({ stats, newBadges, leveledUp: stats.level > previousLevel });
});

// 3. Leaderboard Endpoint
app.get('/api/leaderboard', (req, res) => {
    // Convert DB object to Array
    const users = Object.keys(db).map(key => ({
        userId: key,
        ...db[key].profile,
        ...db[key].stats
    }));

    // Sort by XP Descending
    const leaderboard = users
        .sort((a, b) => b.xp - a.xp)
        .slice(0, 50) // Top 50
        .map((u, index) => ({
            userId: u.userId,
            name: u.profile?.name || 'Explorer',
            photoUrl: u.profile?.photo || '',
            xp: u.xp,
            level: u.level,
            rank: index + 1,
            badges: u.badges.length
        }));

    res.json(leaderboard);
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
