import { Telegraf } from 'telegraf';
import { runCardChargeJob, runCryptoReminderJob } from './charge.js';
import { runExpireJob } from './expire.js';
import { logger } from '../utils/logger.js';
import { runCleanupJob } from './cleanup.js';
import { runPendingCheckJob } from './pending-check.js';

/**
 * Schedule a callback to run daily at the given UTC hours and minute.
 * Computes the next firing time, runs once via setTimeout, then re-schedules.
 */
function scheduleDaily(hoursUtc: number[], minuteUtc: number, name: string, run: () => Promise<void>): void {
  const fire = () => {
    run().catch((err) => logger.error(`${name} failed`, err));
    scheduleNext();
  };

  const scheduleNext = () => {
    const now = new Date();
    const candidates = hoursUtc.map((h) => {
      const target = new Date(Date.UTC(
        now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), h, minuteUtc, 0, 0,
      ));
      if (target.getTime() <= now.getTime()) target.setUTCDate(target.getUTCDate() + 1);
      return target.getTime();
    });
    const nextMs = Math.min(...candidates) - now.getTime();
    setTimeout(fire, nextMs).unref();
    logger.info(`${name} scheduled in ${Math.round(nextMs / 1000 / 60)} min`);
  };

  scheduleNext();
}

/** Start the job scheduler with production schedule (UTC). */
export function startScheduler(bot: Telegraf): void {
  logger.info('Scheduler started (production schedule, UTC)');

  // Expire — daily 07:00 UTC
  scheduleDaily([7], 0, 'Expire job', () => runExpireJob(bot));

  // Card auto-charge — daily 09:00 + 15:00 UTC
  scheduleDaily([9, 15], 0, 'Card charge job', () => runCardChargeJob(bot));

  // Crypto renewal reminder — daily 09:00 + 15:00 UTC
  scheduleDaily([9, 15], 0, 'Crypto reminder job', () => runCryptoReminderJob(bot));

  // Cleanup — daily 03:00 UTC
  scheduleDaily([3], 0, 'Cleanup job', () => runCleanupJob());

  // Pending transactions check — every 5 minutes
  setInterval(() => {
    runPendingCheckJob(bot).catch((err) => logger.error('Pending check job failed', err));
  }, 5 * 60 * 1000).unref();

  // Run pending-check immediately on startup — picks up any stale Pending transactions left from a previous run
  runPendingCheckJob(bot).catch((err) => logger.error('Pending check initial run failed', err));
}
