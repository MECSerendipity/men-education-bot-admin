import 'dotenv/config';
import { createBot } from './bot.js';
import { migrate } from './db/migrate.js';
import { db } from './db/index.js';
import { logger } from './utils/logger.js';
import { startWebhookServer } from './webhook/server.js';
import { expireOverdueSubscriptions } from './db/subscriptions.js';

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
  logger.warn(`Missing WayForPay env vars: ${missingWfp.join(', ')} — card payments will not work`);
}

const missingUsdt = ['USDT_WALLET_ADDRESS', 'USDT_ADMIN_CHANNEL_ID']
  .filter((key) => !process.env[key]);
if (missingUsdt.length > 0) {
  logger.warn(`Missing USDT env vars: ${missingUsdt.join(', ')} — USDT payments will not work`);
}

/* ---------- Launch ---------- */

async function start() {
  await migrate();

  const bot = createBot(BOT_TOKEN!);

  // Start webhook server for WayForPay callbacks
  startWebhookServer(bot);

  // Set bot commands menu (visible in Telegram sidebar)
  await bot.telegram.setMyCommands([
    { command: 'start', description: 'Перезапустити бота' },
  ]);

  bot.launch(() => {
    logger.info('Bot started successfully');
  });

  // Expire overdue subscriptions every 5 minutes
  const expiryInterval = setInterval(async () => {
    try {
      const count = await expireOverdueSubscriptions();
      if (count > 0) {
        logger.info(`Expired ${count} overdue subscriptions`);
      }
    } catch (err) {
      logger.error('Failed to expire subscriptions', err);
    }
  }, 5 * 60 * 1000);
  expiryInterval.unref();

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
