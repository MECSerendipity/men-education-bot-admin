import { Telegraf } from 'telegraf';
import { runCardChargeJob } from './charge.js';
import { runExpireJob } from './expire.js';
import { logger } from '../utils/logger.js';
import { runCleanupJob } from './cleanup.js';
import { runCryptoRenewalReminder } from './crypto-reminder.js';
import { runTestCardCharge } from './card-charge-test.js';
import { runTestExpireJob } from './expire-test.js';

/** Job schedule definition */
interface ScheduledJob {
  name: string;
  utcHour: number;
  run: (bot: Telegraf) => Promise<void>;
}

/** All scheduled jobs — times in UTC */
const JOBS: ScheduledJob[] = [
  { name: 'expire',   utcHour: 7,  run: runExpireJob },
  { name: 'charge-1', utcHour: 9,  run: async (bot) => { await runCardChargeJob(bot); } },
  { name: 'charge-2', utcHour: 15, run: async (bot) => { await runCardChargeJob(bot); } },
  { name: 'cleanup',  utcHour: 3,  run: async () => { await runCleanupJob(); } },
];

/** Track which jobs already ran today (reset at midnight UTC) */
const executedToday = new Set<string>();
let lastResetDate = '';

function resetIfNewDay(): void {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== lastResetDate) {
    executedToday.clear();
    lastResetDate = today;
  }
}

/** Check and run jobs that are due. Called every minute. */
async function tick(bot: Telegraf): Promise<void> {
  resetIfNewDay();

  const now = new Date();
  const currentHour = now.getUTCHours();

  for (const job of JOBS) {
    const jobKey = `${job.name}:${lastResetDate}`;

    if (currentHour >= job.utcHour && !executedToday.has(jobKey)) {
      executedToday.add(jobKey);
      logger.info(`Scheduler: running job "${job.name}" (UTC ${job.utcHour}:00)`);

      try {
        await job.run(bot);
        logger.info(`Scheduler: job "${job.name}" completed`);
      } catch (err) {
        logger.error(`Scheduler: job "${job.name}" failed`, err);
      }
    }
  }
}

/** Start the job scheduler — checks every minute */
export function startScheduler(bot: Telegraf): void {
  logger.info('Scheduler started', {
    jobs: JOBS.map((j) => `${j.name} @ UTC ${j.utcHour}:00`),
  });

  const interval = setInterval(() => {
    tick(bot).catch((err) => logger.error('Scheduler tick failed', err));
  }, 60 * 1000);
  interval.unref();

  // TODO: TESTING MODE — crypto reminder + card charge every 1 min. Remove before production.
  const cryptoReminderInterval = setInterval(() => {
    runCryptoRenewalReminder(bot).catch((err) => logger.error('Crypto reminder tick failed', err));
  }, 60 * 1000);
  cryptoReminderInterval.unref();

  const testCardChargeInterval = setInterval(() => {
    runTestCardCharge(bot).catch((err) => logger.error('Test card charge tick failed', err));
  }, 60 * 1000);
  testCardChargeInterval.unref();

  const testExpireInterval = setInterval(() => {
    runTestExpireJob(bot).catch((err) => logger.error('Test expire tick failed', err));
  }, 30 * 1000);
  testExpireInterval.unref();

  // Run immediately on startup to catch any missed jobs
  tick(bot).catch((err) => logger.error('Scheduler initial tick failed', err));
  runCryptoRenewalReminder(bot).catch((err) => logger.error('Crypto reminder initial tick failed', err));
  runTestCardCharge(bot).catch((err) => logger.error('Test card charge initial tick failed', err));
  runTestExpireJob(bot).catch((err) => logger.error('Test expire initial tick failed', err));
}
