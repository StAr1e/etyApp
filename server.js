import 'dotenv/config';
import express from 'express';
import path from 'path';
import cors from 'cors';
import { Telegraf, Markup } from 'telegraf';
import { GoogleGenAI } from '@google/genai';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.GEMINI_API_KEY;

// Initialize Telegram Bot
const botToken = process.env.TELEGRAM_BOT_TOKEN;
let bot = null;

if (botToken) {
    bot = new Telegraf(botToken);
    const APP_URL = process.env.RENDER_EXTERNAL_URL || process.env.HOSTING_URL || 'http://localhost:3000';

    bot.command('start', (ctx) => {
        ctx.reply(
            'Welcome to Ety.ai! 🌍\n\nDiscover the hidden origins of words.',
            Markup.inlineKeyboard([
                Markup.button.webApp('🚀 Launch Explorer', APP_URL)
            ])
        );
    });

    bot.on('inline_query', async (ctx) => {
        const query = ctx.inlineQuery.query;
        if (!query) return;

        let title = query;
        let description = 'Ety.ai Word Result';
        let messageText = query;

        if (query.includes(':')) {
            const parts = query.split(':');
            title = parts[0].trim();
            description = parts.slice(1).join(':').trim();
            messageText = `<b>${title.toUpperCase()}</b>\n\n${description}\n\n<i>🔗 Discovered via Ety.ai</i>`;
        }

        try {
            await ctx.answerInlineQuery([{
                type: 'article',
                id: String(Date.now()),
                title: title,
                description: description.substring(0, 100),
                thumbnail_url: 'https://cdn-icons-png.flaticon.com/512/3976/3976625.png',
                input_message_content: { message_text: messageText, parse_mode: 'HTML' },
                reply_markup: { inline_keyboard: [[Markup.button.webApp('🔎 Explore More', APP_URL)]] }
            }], { cache_time: 0 });
        } catch (e) {
            console.error("Inline Query Error:", e);
        }
    });

    bot.launch().then(() => console.log('Telegram Bot started'));
    process.once('SIGINT', () => bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot.stop('SIGTERM'));
}

// Middleware
app.use(cors());
app.use(express.json());
// Serve Static Files from the React Build
app.use(express.static(path.join(__dirname, 'dist')));

// --- GEMINI API ENDPOINTS ---

const ai = API_KEY ? new GoogleGenAI({ apiKey: API_KEY }) : null;

// 1. Details Endpoint
app.get('/api/details', async (req, res) => {
    if (!ai) return res.status(500).json({ error: "Server missing API Key" });
    const { word } = req.query;
    if (!word) return res.status(400).json({ error: "Word required" });

    const prompt = `Analyze the word "${word}" for an etymology dictionary app. Provide precise, academic but accessible details. If the word is misspelled, analyze the closest correct word.`;
    
    // Manual Schema definition for consistency
    const schema = {
        type: "OBJECT",
        properties: {
            word: { type: "STRING" },
            phonetic: { type: "STRING" },
            partOfSpeech: { type: "STRING" },
            definition: { type: "STRING" },
            etymology: { type: "STRING" },
            roots: {
                type: "ARRAY",
                items: {
                    type: "OBJECT",
                    properties: {
                        term: { type: "STRING" },
                        language: { type: "STRING" },
                        meaning: { type: "STRING" },
                    }
                }
            },
            examples: { type: "ARRAY", items: { type: "STRING" } },
            synonyms: { type: "ARRAY", items: { type: "STRING" } },
            funFact: { type: "STRING" },
        },
        required: ["word", "phonetic", "definition", "etymology", "roots", "examples", "synonyms", "funFact"]
    };

    try {
        const result = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                responseMimeType: 'application/json',
                responseSchema: schema,
                systemInstruction: "You are an expert etymologist."
            }
        });
        
        let text = result.text.trim();
        // Clean markdown if present
        if (text.startsWith('```')) text = text.replace(/^```(json)?/, '').replace(/```$/, '');
        
        res.json(JSON.parse(text));
    } catch (e) {
        console.error("Details API Error:", e);
        res.status(500).json({ error: e.message });
    }
});

// 2. Summary Endpoint
app.get('/api/summary', async (req, res) => {
    if (!ai) return res.status(500).json({ error: "Server missing API Key" });
    const { word } = req.query;
    if (!word) return res.status(400).json({ error: "Word required" });

    try {
        const result = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `Write a fascinating, storytelling-style deep dive summary about the hidden history and evolution of the word "${word}". Keep it under 150 words.`,
        });
        res.json({ summary: result.text });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 3. TTS Endpoint
app.get('/api/tts', async (req, res) => {
    if (!ai) return res.status(500).json({ error: "Server missing API Key" });
    const { text } = req.query;
    if (!text) return res.status(400).json({ error: "Text required" });

    try {
        const result = await ai.models.generateContent({
            model: 'gemini-2.5-flash-preview-tts',
            contents: [{ parts: [{ text }] }],
            config: {
                responseModalities: ["AUDIO"],
                speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Fenrir' } } },
            },
        });
        const audio = result.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if(audio) res.json({ audio });
        else res.status(500).json({ error: "No audio generated" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Handle React Routing
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});