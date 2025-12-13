require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const APP_URL = process.env.HOSTING_URL || 'https://your-app-url.vercel.app';

// 1. Handle /start command
bot.command('start', (ctx) => {
  ctx.reply(
    'Welcome to Ety.ai! 🌍\n\nDiscover the hidden origins of words.',
    Markup.inlineKeyboard([
      Markup.button.webApp('🚀 Launch Explorer', APP_URL)
    ])
  );
});

// 2. Handle Inline Queries (The "Share" functionality)
// This listens for queries coming from the Mini App's switchInlineQuery method
bot.on('inline_query', async (ctx) => {
  const query = ctx.inlineQuery.query;

  // If empty query, show a placeholder
  if (!query) {
    return ctx.answerInlineQuery([{
      type: 'article',
      id: 'default',
      title: 'Search Ety.ai',
      description: 'Type a word to search...',
      input_message_content: {
        message_text: 'Check out Ety.ai for word origins!'
      }
    }]);
  }

  // Parse the query format "Word: Definition" sent from Frontend
  // If the user types manually, we treat the whole string as the word
  let title = query;
  let description = 'Ety.ai Word Result';
  let messageText = query;

  if (query.includes(':')) {
    const parts = query.split(':');
    title = parts[0].trim();
    description = parts.slice(1).join(':').trim();
    
    // Format the message that will be sent to the chat
    messageText = `<b>${title.toUpperCase()}</b>\n\n${description}\n\n<i>🔗 Discovered via Ety.ai</i>`;
  }

  const results = [{
    type: 'article',
    id: String(Date.now()), // Unique ID
    title: title,
    description: description.substring(0, 100) + (description.length > 100 ? '...' : ''),
    thumbnail_url: 'https://cdn-icons-png.flaticon.com/512/3976/3976625.png', // Generic Dictionary Icon
    input_message_content: {
      message_text: messageText,
      parse_mode: 'HTML'
    },
    reply_markup: {
      inline_keyboard: [[
        Markup.button.webApp('🔎 Explore More', APP_URL)
      ]]
    }
  }];

  try {
    await ctx.answerInlineQuery(results, { cache_time: 0 });
  } catch (error) {
    console.error('Error answering inline query:', error);
  }
});

console.log('Bot is running...');
bot.launch();

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));