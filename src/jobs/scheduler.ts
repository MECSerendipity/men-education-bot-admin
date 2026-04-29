import { Telegraf } from 'telegraf';
import { runCardChargeJob, runCryptoReminderJob } from './charge.js';
import { runExpireJob } from './expire.js';
import { logger } from '../utils/logger.js';
import { runCleanupJob } from './cleanup.js';
import { runPendingCheckJob } from './pending-check.js';

/**
 * TESTING MODE: all jobs run every minute for testing.
 * Before production: change intervals back to scheduled hours.
 *
 * Production schedule:
 *   expire        — 07:00 UTC (10:00 Kyiv)
 *   charge        — 09:00, 15:00 UTC (12:00, 18:00 Kyiv)
 *   crypto-remind — 09:00, 15:00 UTC (12:00, 18:00 Kyiv)
 *   cleanup       — 03:00 UTC (06:00 Kyiv)
 *   pending-check — every 5 minutes
 */

/** Start the job scheduler */
export function startScheduler(bot: Telegraf): void {
  logger.info('Scheduler started (TESTING MODE — all jobs every 1 min)');

  // Card charge — every 1 min (prod: 09:00 + 15:00 UTC)
  setInterval(() => {
    runCardChargeJob(bot).catch((err) => logger.error('Card charge job failed', err));
  }, 60 * 1000).unref();

  // Crypto reminder — every 1 min (prod: 09:00 + 15:00 UTC)
  setInterval(() => {
    runCryptoReminderJob(bot).catch((err) => logger.error('Crypto reminder job failed', err));
  }, 60 * 1000).unref();

  // Expire — every 1 min (prod: 07:00 UTC)
  setInterval(() => {
    runExpireJob(bot).catch((err) => logger.error('Expire job failed', err));
  }, 60 * 1000).unref();

  // Pending transactions check — every 5 min (same in prod)
  setInterval(() => {
    runPendingCheckJob(bot).catch((err) => logger.error('Pending check job failed', err));
  }, 5 * 60 * 1000).unref();

  // Cleanup — every 1 min (prod: 03:00 UTC)
  setInterval(() => {
    runCleanupJob().catch((err) => logger.error('Cleanup job failed', err));
  }, 60 * 1000).unref();

  // Run all immediately on startup
  runCardChargeJob(bot).catch((err) => logger.error('Card charge initial run failed', err));
  runCryptoReminderJob(bot).catch((err) => logger.error('Crypto reminder initial run failed', err));
  runExpireJob(bot).catch((err) => logger.error('Expire initial run failed', err));
  runPendingCheckJob(bot).catch((err) => logger.error('Pending check initial run failed', err));
  runCleanupJob().catch((err) => logger.error('Cleanup initial run failed', err));
}
