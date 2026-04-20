import { Telegraf } from 'telegraf';
import { db } from '../db/index.js';
import { type Subscription } from '../db/subscriptions.js';
import { logger } from '../utils/logger.js';
import { sendCryptoPaymentReminder } from '../handlers/usdt-payment.js';

/**
 * TODO: TESTING MODE — runs every 1 min via scheduler.
 * Remove or convert to production schedule before deploying.
 */

/** Find Active crypto subscriptions expiring within 1 day */
async function getCryptoSubscriptionsExpiringSoon(): Promise<Subscription[]> {
  const result = await db.query(
    `SELECT * FROM subscriptions
     WHERE status = 'Active'
       AND method = 'crypto'
       AND prices IS NOT NULL
       AND expires_at < NOW() + INTERVAL '1 day'
       AND expires_at > NOW()`,
  );
  return result.rows;
}

/** Run crypto renewal reminder — sends full payment message to users with expiring crypto subscriptions */
export async function runCryptoRenewalReminder(bot: Telegraf): Promise<void> {
  const subs = await getCryptoSubscriptionsExpiringSoon();

  if (subs.length === 0) return;

  for (const sub of subs) {
    logger.info('Crypto reminder: sending payment message', {
      telegramId: sub.telegram_id,
      plan: sub.plan,
    });

    try {
      await sendCryptoPaymentReminder(bot, sub.telegram_id, sub.plan);
    } catch (err) {
      logger.error('Crypto reminder: failed to send', { telegramId: sub.telegram_id, err });
    }
  }
}
