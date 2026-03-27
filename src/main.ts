import 'dotenv/config';
import { createBot } from './bot.js';
import { migrate } from './db/migrate.js';

/* ---------- Config validation ---------- */

const BOT_TOKEN = process.env.BOT_TOKEN;

if (!BOT_TOKEN) {
  console.error('❌ BOT_TOKEN is missing in .env file');
  process.exit(1);
}

/* ---------- Launch ---------- */

async function start() {
  await migrate();

  const bot = createBot(BOT_TOKEN!);

  bot.launch(() => {
    console.log('🤖 Bot started successfully!');
  });

  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}

start().catch((err) => {
  console.error('❌ Failed to start:', err);
  process.exit(1);
});

