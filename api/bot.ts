import { Telegraf, Markup } from 'telegraf';

// Initialize Bot
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN!);

// Determine the base URL (handle Vercel environment automatically)
const APP_URL = process.env.VERCEL_URL 
  ? `https://${process.env.VERCEL_URL}` 
  : (process.env.HOSTING_URL || 'https://ety.ai');

// 1. /start command
bot.command('start', (ctx) => {
  ctx.reply(
    'Welcome to Ety.ai! 🌍\n\nDiscover the hidden origins of words.',
    Markup.inlineKeyboard([
      Markup.button.webApp('🚀 Launch Explorer', APP_URL)
    ])
  );
});

// 2. Inline Query (The Share Feature)
bot.on('inline_query', async (ctx) => {
  const query = ctx.inlineQuery.query;

  // Default empty state
  if (!query) {
    return ctx.answerInlineQuery([{
      type: 'article',
      id: 'default',
      title: 'Search Ety.ai',
      description: 'Type a word to search...',
      thumbnail_url: 'https://cdn-icons-png.flaticon.com/512/3976/3976625.png',
      input_message_content: {
        message_text: 'Check out Ety.ai for word origins!'
      },
      reply_markup: { inline_keyboard: [[Markup.button.webApp('🚀 Open App', APP_URL)]] }
    }]);
  }

  // Parse "Word: Definition" string from the Frontend
  let title = query;
  let description = 'Ety.ai Word Result';
  let messageText = query;

  if (query.includes(':')) {
    const parts = query.split(':');
    title = parts[0].trim(); // The Word
    description = parts.slice(1).join(':').trim(); // The Definition
    
    // Create a nice HTML message for the chat
    messageText = `<b>${title.toUpperCase()}</b>\n\n${description}\n\n<i>🔗 Discovered via Ety.ai</i>`;
  }

  // Construct Deep Link URL
  // We append ?word=TERM so the web app knows what to load immediately
  const deepLinkUrl = `${APP_URL}?word=${encodeURIComponent(title)}`;

  const results = [{
    type: 'article',
    id: String(Date.now()),
    title: title,
    description: description,
    thumbnail_url: 'https://cdn-icons-png.flaticon.com/512/3976/3976625.png',
    input_message_content: {
      message_text: messageText,
      parse_mode: 'HTML'
    },
    reply_markup: {
      inline_keyboard: [[
        Markup.button.webApp(`🔎 Explore "${title}"`, deepLinkUrl)
      ]]
    }
  }];

  try {
    // Answer within 10 seconds or Telegram cancels it
    await ctx.answerInlineQuery(results as any, { cache_time: 0 });
  } catch (error) {
    console.error('Error answering inline query:', error);
  }
});

// Vercel Serverless Entry Point
export default async function handler(request: any, response: any) {
  // Only accept POST requests from Telegram
  if (request.method !== 'POST') {
    return response.status(200).send('Bot is active. Send POST requests via Telegram Webhook.');
  }

  try {
    await bot.handleUpdate(request.body);
    response.status(200).send('OK');
  } catch (error) {
    console.error('Bot Error:', error);
    response.status(500).send('Error');
  }
}