import 'dotenv/config';
import express from 'express';
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import { GoogleGenAI } from '@google/genai';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.GEMINI_API_KEY;
const MONGODB_URI = process.env.MONGODB_URI;

// --- DATABASE STRATEGY ---
// If MONGODB_URI is present, use MongoDB. Otherwise, fallback to local JSON file.
let useMongo = false;
let User; // Mongoose Model

// MongoDB Setup
if (MONGODB_URI) {
    console.log("Connecting to MongoDB...");
    mongoose.connect(MONGODB_URI)
        .then(() => {
            console.log("MongoDB Connected");
            useMongo = true;
            
            const UserSchema = new mongoose.Schema({
                userId: { type: String, required: true, unique: true, index: true },
                profile: {
                    name: { type: String, default: 'Explorer' },
                    photo: { type: String, default: '' }
                },
                stats: {
                    xp: { type: Number, default: 0 },
                    level: { type: Number, default: 1 },
                    wordsDiscovered: { type: Number, default: 0 },
                    summariesGenerated: { type: Number, default: 0 },
                    shares: { type: Number, default: 0 },
                    lastVisit: { type: Number, default: Date.now },
                    currentStreak: { type: Number, default: 1 },
                    badges: { type: [String], default: [] }
                },
                searchHistory: [{
                    word: String,
                    timestamp: Number,
                    data: Object,
                    summary: String
                }]
            }, { timestamps: true });
            
            User = mongoose.models.User || mongoose.model('User', UserSchema);
        })
        .catch(err => {
            console.error("MongoDB Connection Failed:", err);
            console.log("Falling back to JSON file storage.");
        });
} else {
    console.log("No MONGODB_URI found. Using local JSON fallback.");
}

// File-Based DB Fallback
const DB_FILE = path.join(__dirname, 'gamification.db.json');
let localDb = {};

const loadLocalDb = () => {
    if (fs.existsSync(DB_FILE)) {
        try {
            localDb = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
        } catch (e) {
            console.error("Failed to load DB", e);
            localDb = {};
        }
    }
};
if (!MONGODB_URI) loadLocalDb();

const saveLocalDb = () => {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(localDb, null, 2));
    } catch (e) {
        console.error("Failed to save DB", e);
    }
};

// --- CACHE SETUP ---
const wordCache = new Map();
const summaryCache = new Map();
const imageCache = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000;

const getFromCache = (cache, key) => {
    const item = cache.get(key);
    if (item && Date.now() - item.timestamp < CACHE_TTL) return item.data;
    return null;
};

const setCache = (cache, key, data) => {
    if (cache.size > 50) {
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

app.post('/api/image', async (req, res) => {
    if (!ai) return res.status(500).json({ error: "Server missing API Key" });
    const { word, etymology } = req.body;
    if (!word) return res.status(400).json({ error: "Word required" });

    const cleanWord = word.trim().toLowerCase();
    const cached = getFromCache(imageCache, cleanWord);
    if (cached) return res.json({ image: cached });

    try {
        const prompt = `Create a high-quality, artistic, surrealist illustration representing the concept and etymological origin of the word "${word}". Context: ${etymology ? etymology.substring(0, 300) : 'Abstract representation'}. The image should be a symbolic, visual interpretation without any text.`;
        
        const result = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: { parts: [{ text: prompt }] },
        });

        let base64Image = null;
        if (result.candidates?.[0]?.content?.parts) {
            for (const part of result.candidates[0].content.parts) {
                if (part.inlineData && part.inlineData.data) {
                    base64Image = part.inlineData.data;
                    break;
                }
            }
        }

        if (base64Image) {
            setCache(imageCache, cleanWord, base64Image);
            res.json({ image: base64Image });
        } else {
            console.error("No image generated:", JSON.stringify(result));
            res.status(500).json({ error: "No image data" });
        }
    } catch (e) {
        console.error(e);
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

// --- GAMIFICATION ENDPOINTS ---
const XP_ACTIONS = { SEARCH: 15, SUMMARY: 30, SHARE: 50, DAILY_VISIT: 100 };
const INITIAL_STATS = { xp: 0, level: 1, wordsDiscovered: 0, summariesGenerated: 0, shares: 0, lastVisit: 0, currentStreak: 1, badges: [] };

app.get('/api/gamification', async (req, res) => {
    const { userId, name, photo } = req.query;
    if (!userId) return res.status(400).json({ error: "userId required" });
    const idStr = userId.toString();

    // --- MONGO PATH ---
    if (useMongo && User) {
        try {
            let user = await User.findOne({ userId: idStr });
            if (!user) {
                user = await User.create({
                    userId: idStr,
                    profile: { name: name || 'Explorer', photo: photo || '' },
                    stats: { ...INITIAL_STATS },
                    searchHistory: []
                });
            } else if (name || photo) {
                if(name) user.profile.name = name;
                if(photo) user.profile.photo = photo;
            }

            // Streak Logic
            const last = new Date(user.stats.lastVisit);
            const now = new Date();
            const isSameDay = last.getDate() === now.getDate() && last.getMonth() === now.getMonth() && last.getFullYear() === now.getFullYear();
            
            if (!isSameDay) {
                const diffTime = Math.abs(now.getTime() - last.getTime());
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
                if (diffDays <= 2) {
                    user.stats.currentStreak += 1;
                    user.stats.xp += XP_ACTIONS.DAILY_VISIT;
                } else {
                    user.stats.currentStreak = 1;
                }
                user.stats.lastVisit = Date.now();
                user.markModified('stats');
                await user.save();
            }
            return res.json({ stats: user.stats, history: user.searchHistory || [] });
        } catch(e) {
            console.error("Mongo Error", e);
            return res.status(500).json({error: "DB Error"});
        }
    }

    // --- LOCAL FILE PATH ---
    let userData = localDb[idStr] || { 
        stats: { ...INITIAL_STATS, lastVisit: Date.now() },
        profile: { name: name || 'Explorer', photo: photo || '' },
        searchHistory: []
    };
    if (name) userData.profile.name = name;
    if (photo) userData.profile.photo = photo;

    let stats = userData.stats;
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
    }
    userData.stats = stats;
    localDb[idStr] = userData;
    saveLocalDb();
    res.json({ stats, history: userData.searchHistory || [] });
});

app.post('/api/gamification', async (req, res) => {
    const { userId, action, name, photo, stats: syncedStats, payload } = req.body;
    if (!action) return res.status(400).json({ error: "Missing action" });

    // --- LEADERBOARD ---
    if (action === 'LEADERBOARD') {
        let leaderboard = [];
        
        if (useMongo && User) {
             if (userId) {
                await User.findOneAndUpdate(
                    { userId: userId.toString() },
                    { 
                        $set: { 'profile.name': name || 'Explorer', 'profile.photo': photo || '' },
                        ...(syncedStats ? { $max: { 'stats.xp': syncedStats.xp } } : {})
                    },
                    { upsert: true, new: true, setDefaultsOnInsert: true }
                );
             }
             const users = await User.find({}).sort({ 'stats.xp': -1 }).limit(50);
             leaderboard = users.map((u, index) => ({
                 userId: u.userId,
                 name: u.profile.name,
                 photoUrl: u.profile.photo,
                 xp: u.stats.xp,
                 level: u.stats.level,
                 rank: index + 1,
                 badges: u.stats.badges.length
             }));
        } else {
             // Local Fallback
             if (userId && syncedStats) {
                 const idStr = userId.toString();
                 let existing = localDb[idStr];
                 if (!existing || (syncedStats.xp > (existing.stats?.xp || 0))) {
                     localDb[idStr] = {
                         stats: syncedStats,
                         profile: { name: name || 'Explorer', photo: photo || '' },
                         searchHistory: existing?.searchHistory || []
                     };
                     saveLocalDb();
                 }
             }
             const users = Object.keys(localDb).map(key => ({ userId: key, ...localDb[key].profile, ...localDb[key].stats }));
             leaderboard = users.sort((a, b) => b.xp - a.xp).slice(0, 50).map((u, index) => ({
                 userId: u.userId,
                 name: u.name || 'Explorer',
                 photoUrl: u.photoUrl || '',
                 xp: u.xp,
                 level: u.stats.level,
                 rank: index + 1,
                 badges: u.stats.badges.length
             }));
        }
        return res.json(leaderboard);
    }

    if (!userId) return res.status(400).json({ error: "userId required" });
    const idStr = userId.toString();

    // Helper for history update
    const updateHistory = (history, pl, act) => {
        if (!history) history = [];
        if (act === 'SEARCH' && pl && pl.wordData) {
            history = history.filter(item => item.word.toLowerCase() !== pl.wordData.word.toLowerCase());
            history.unshift({
                word: pl.wordData.word,
                timestamp: Date.now(),
                data: pl.wordData,
                summary: pl.summary || ''
            });
            if (history.length > 50) history = history.slice(0, 50);
        }
        if (act === 'SUMMARY' && pl && pl.word && pl.summary) {
            const idx = history.findIndex(h => h.word.toLowerCase() === pl.word.toLowerCase());
            if (idx !== -1) history[idx].summary = pl.summary;
        }
        return history;
    };

    // --- MONGO UPDATE ---
    if (useMongo && User) {
        try {
            let user = await User.findOne({ userId: idStr });
            if (!user) {
                user = new User({
                    userId: idStr,
                    profile: { name: name || 'Explorer', photo: photo || '' },
                    stats: { ...INITIAL_STATS },
                    searchHistory: []
                });
            }
            
            const stats = user.stats;
            const previousLevel = stats.level;
            stats.xp += (XP_ACTIONS[action] || 0);
            if (action === 'SEARCH') stats.wordsDiscovered++;
            if (action === 'SUMMARY') stats.summariesGenerated++;
            if (action === 'SHARE') stats.shares++;
            stats.level = 1 + Math.floor(Math.sqrt(stats.xp / 50));
            
            // Badge Logic
            const newBadges = [];
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
            user.markModified('stats');

            // Handle History
            user.searchHistory = updateHistory(user.searchHistory, payload, action);
            user.markModified('searchHistory');

            await user.save();
            
            return res.json({ stats, history: user.searchHistory, newBadges, leveledUp: stats.level > previousLevel });
        } catch(e) {
            console.error(e);
            return res.status(500).json({error: "DB Error"});
        }
    }

    // --- LOCAL FALLBACK ---
    let userData = localDb[idStr] || { stats: { ...INITIAL_STATS }, profile: { name: 'Unknown', photo: '' }, searchHistory: [] };
    let stats = userData.stats;
    const newBadges = [];
    const previousLevel = stats.level;

    stats.xp += (XP_ACTIONS[action] || 0);
    if (action === 'SEARCH') stats.wordsDiscovered++;
    if (action === 'SUMMARY') stats.summariesGenerated++;
    if (action === 'SHARE') stats.shares++;
    stats.level = 1 + Math.floor(Math.sqrt(stats.xp / 50));

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
    
    // History
    userData.searchHistory = updateHistory(userData.searchHistory, payload, action);

    localDb[idStr] = userData;
    saveLocalDb();

    res.json({ stats, history: userData.searchHistory, newBadges, leveledUp: stats.level > previousLevel });
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});