import { Telegraf } from 'telegraf';

export default async function handler(request: any, response: any) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const vercelUrl = process.env.VERCEL_URL; // Vercel provides this automatically
  const manualUrl = process.env.HOSTING_URL; // Or you can set this in .env

  if (!token) {
    return response.status(500).json({ error: 'TELEGRAM_BOT_TOKEN is missing in Environment Variables.' });
  }

  const bot = new Telegraf(token);
  
  // Construct the full URL to the api/bot endpoint
  // Prefer HOSTING_URL if set, otherwise use VERCEL_URL
  const host = manualUrl || `https://${vercelUrl}`;
  const webhookUrl = `${host}/api/bot`;

  try {
    // Tell Telegram to send updates to this URL
    await bot.telegram.setWebhook(webhookUrl);
    
    return response.status(200).json({
      success: true,
      message: `Webhook successfully set to: ${webhookUrl}`,
      note: 'Your bot is now connected to Vercel!'
    });
  } catch (error: any) {
    return response.status(500).json({
      success: false,
      error: error.message,
      webhookUrl_attempted: webhookUrl
    });
  }
}