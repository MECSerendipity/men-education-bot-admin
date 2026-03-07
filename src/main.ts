import 'dotenv/config';
import { createBot } from './bot.js';

/* ---------- Config validation ---------- */

const BOT_TOKEN = process.env.BOT_TOKEN;

if (!BOT_TOKEN) {
  console.error('❌ BOT_TOKEN is missing in .env file');
  process.exit(1);
}

/* ---------- Launch ---------- */

const bot = createBot(BOT_TOKEN);

bot.launch(() => {
  console.log('🤖 Bot started successfully!');
});

/* ---------- Graceful shutdown ---------- */

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
