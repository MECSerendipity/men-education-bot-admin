import { Telegraf } from 'telegraf';
import { db } from '../db/index.js';
import { revokeAccessForUser } from '../services/invite.js';
import { logSubscriptionEvent } from '../db/subscription-events.js';
import { logger } from '../utils/logger.js';
import { churnReferral } from '../db/partners.js';

/**
 * Expire overdue subscriptions and kick users from channels.
 *
 * - Active  + expires_at::date < today  → status = Expired + kick
 * - Cancelled + expires_at::date < today → status stays Cancelled + kick
 */
export async function runExpireJob(bot: Telegraf): Promise<void> {
  // Step 1: Move Active → Expired
  const expiredResult = await db.query(
    `WITH expired AS (
       UPDATE subscriptions
       SET status = 'Expired', updated_at = NOW()
       WHERE status = 'Active' AND expires_at::date < CURRENT_DATE
       RETURNING id, telegram_id, plan, method, card_pan, expires_at
     )
     UPDATE users SET is_subscribed = FALSE, updated_at = NOW()
     WHERE telegram_id IN (SELECT telegram_id FROM expired)
     RETURNING telegram_id`,
  );

  // Log expired events
  const expiredSubs = await db.query(
    `SELECT id, telegram_id, plan, method, card_pan, expires_at FROM subscriptions
     WHERE status = 'Expired' AND updated_at > NOW() - INTERVAL '1 minute'`,
  );
  for (const sub of expiredSubs.rows) {
    await logSubscriptionEvent({
      subscriptionId: sub.id,
      telegramId: sub.telegram_id,
      event: 'expired',
      plan: sub.plan,
      method: sub.method,
      cardPan: sub.card_pan,
      expiresAt: sub.expires_at,
    });
  }

  const expiredUsers: number[] = expiredResult.rows.map((r: { telegram_id: number }) => r.telegram_id);

  // Step 2: Find Cancelled subscriptions that have passed their expires_at (kick but keep status)
  const cancelledResult = await db.query(
    `SELECT telegram_id FROM subscriptions
     WHERE status = 'Cancelled' AND expires_at::date < CURRENT_DATE`,
  );

  const cancelledUsers: number[] = cancelledResult.rows.map((r: { telegram_id: number }) => r.telegram_id);

  // Update is_subscribed for cancelled users too
  if (cancelledUsers.length > 0) {
    await db.query(
      `UPDATE users SET is_subscribed = FALSE, updated_at = NOW()
       WHERE telegram_id = ANY($1)`,
      [cancelledUsers],
    );
  }

  const allUsersToKick = [...new Set([...expiredUsers, ...cancelledUsers])];

  if (allUsersToKick.length === 0) return;

  logger.info(`Expire job: processing ${expiredUsers.length} expired + ${cancelledUsers.length} cancelled subscription(s)`);

  for (const telegramId of allUsersToKick) {
    try {
      await revokeAccessForUser(bot, telegramId);
      logger.info('Expire job: revoked access', { telegramId });
    } catch (err) {
      logger.error('Expire job: failed to revoke access', { telegramId, err });
    }

    // Break partner commission chain — this user can no longer generate commissions
    try {
      await churnReferral(telegramId);
    } catch (err) {
      logger.error('Expire job: failed to churn referral', { telegramId, err });
    }

    // Notify user
    try {
      await bot.telegram.sendMessage(
        telegramId,
        `\u{1F514} Твоя підписка закінчилась.\n\n` +
        `Доступ до клубу призупинено. Оформи підписку, щоб повернутись!`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '\u{1F4B3} Оформити підписку', callback_data: 'subscription' }],
            ],
          },
        },
      );
    } catch (err) {
      logger.error('Expire job: failed to notify user', err);
    }
  }
}
