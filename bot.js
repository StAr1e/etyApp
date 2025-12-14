require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const http = require('http');

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const APP_URL = process.env.HOSTING_URL || '';

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
    id: String(Date.now()),
    title: title,
    description: description.substring(0, 100) + (description.length > 100 ? '...' : ''),
    thumbnail_url: 'https://cdn-icons-png.flaticon.com/512/3976/3976625.png', 
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

// 3. Start the Bot
console.log('Bot is polling...');
bot.launch();

// 4. Create a dummy HTTP server for Render Health Check
// Render requires a web service to bind to a port within 60 seconds.
const PORT = process.env.PORT || 8080;
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Ety.ai Bot is running');
});

server.listen(PORT, () => {
  console.log(`Health check server listening on port ${PORT}`);
});

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
