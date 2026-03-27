import 'dotenv/config';
import { createBot } from './bot.js';
import { migrate } from './db/migrate.js';
import { db } from './db/index.js';
import { logger } from './utils/logger.js';
import { startWebhookServer } from './webhook/server.js';

/* ---------- Config validation ---------- */

const BOT_TOKEN = process.env.BOT_TOKEN;

if (!BOT_TOKEN) {
  logger.error('BOT_TOKEN is missing in .env file');
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  logger.error('DATABASE_URL is missing in .env file');
  process.exit(1);
}

const missingWfp = ['WAYFORPAY_MERCHANT_ACCOUNT', 'WAYFORPAY_SECRET_KEY', 'WAYFORPAY_MERCHANT_DOMAIN', 'WEBHOOK_BASE_URL']
  .filter((key) => !process.env[key]);
if (missingWfp.length > 0) {
  logger.warn(`Missing WayForPay env vars: ${missingWfp.join(', ')} — payments will not work`);
}

/* ---------- Launch ---------- */

async function start() {
  await migrate();

  const bot = createBot(BOT_TOKEN!);

  // Start webhook server for WayForPay callbacks
  startWebhookServer(bot);

  bot.launch(() => {
    logger.info('Bot started successfully');
  });

  // Graceful shutdown — stop bot and close DB pool
  const shutdown = (signal: string) => {
    logger.info('Shutting down', { signal });
    bot.stop(signal);
    db.pool.end().catch((err) => {
      logger.error('Failed to close DB pool', err);
    });
  };

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

start().catch((err) => {
  logger.error('Failed to start', err);
  process.exit(1);
});
