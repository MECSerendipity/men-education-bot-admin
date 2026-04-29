import { Telegraf } from 'telegraf';
import { db } from '../db/index.js';
import { revokeAccessForUser } from '../services/invite.js';
import { logSubscriptionEvent } from '../db/subscription-events.js';
import { logger } from '../utils/logger.js';
import { deactivateReferral } from '../db/partners.js';
import { getUserByTelegramId } from '../db/users.js';
import { escapeHtml } from '../utils/html.js';
import { TEXTS } from '../texts/index.js';
import { USDT, PARTNER } from '../config.js';
import { notifyJobResult } from '../services/job-monitor.js';
import { refreshMenuKeyboard } from '../keyboards/index.js';

/**
 * Expire overdue subscriptions and kick users from channels.
 *
 * - Active  + expires_at::date < today  → status = Expired + kick
 * - Cancelled + expires_at::date < today → status stays Cancelled + kick
 */
export async function runExpireJob(bot: Telegraf): Promise<void> {
  // Step 1: Move Active → Expired (only unrevoked)
  const expiredResult = await db.query(
    `WITH expired AS (
       UPDATE subscriptions
       SET status = 'Expired', access_revoked = TRUE, updated_at = NOW()
       WHERE status = 'Active' AND expires_at::date < CURRENT_DATE AND access_revoked = FALSE
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

  // Step 2: Find Cancelled subscriptions that have passed their expires_at (only unrevoked)
  const cancelledResult = await db.query(
    `UPDATE subscriptions SET access_revoked = TRUE, updated_at = NOW()
     WHERE status = 'Cancelled' AND expires_at::date < CURRENT_DATE AND access_revoked = FALSE
     RETURNING telegram_id`,
  );

  const cancelledUsers: number[] = cancelledResult.rows.map((r: { telegram_id: number }) => r.telegram_id);

  // Update is_subscribed for cancelled users
  if (cancelledUsers.length > 0) {
    await db.query(
      `UPDATE users SET is_subscribed = FALSE, updated_at = NOW()
       WHERE telegram_id = ANY($1)`,
      [cancelledUsers],
    );
  }

  const allUsersToKick = [...new Set([...expiredUsers, ...cancelledUsers])];

  if (allUsersToKick.length === 0) {
    await notifyJobResult(bot, { jobName: 'Expire Subscriptions', found: 0, success: 0, failed: 0 });
    return;
  }

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
      await deactivateReferral(telegramId);
    } catch (err) {
      logger.error('Expire job: failed to deactivate referral', { telegramId, err });
    }

    // Notify user and refresh keyboard (remove partner button)
    try {
      await bot.telegram.sendMessage(
        telegramId,
        TEXTS.SUBSCRIPTION_EXPIRED_NOTIFICATION,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: TEXTS.BTN_SUBSCRIBE, callback_data: 'subscription' }],
            ],
          },
        },
      );
      await refreshMenuKeyboard(bot, telegramId, false);
    } catch (err) {
      logger.error('Expire job: failed to notify user', err);
    }

    // Notify admin channel (thread 42) about churn
    try {
      if (USDT.adminChannelId) {
        const user = await getUserByTelegramId(telegramId);
        const usernameDisplay = user?.username ? `@${escapeHtml(user.username)}` : 'немає';
        const reason = cancelledUsers.includes(telegramId) ? 'Cancelled' : 'Expired';

        // Get subscription details
        const subResult = await db.query(
          `SELECT id, plan, method FROM subscriptions
           WHERE telegram_id = $1 AND status IN ('Expired', 'Cancelled')
           ORDER BY updated_at DESC LIMIT 1`,
          [telegramId],
        );
        const sub = subResult.rows[0];

        await bot.telegram.sendMessage(
          USDT.adminChannelId,
          `<b>ME - користувач відписався:</b>\n\n` +
          `▸ User ID: <code>${user?.id ?? 'N/A'}</code>\n` +
          `▸ Username: ${usernameDisplay}\n` +
          `▸ Telegram ID: <code>${telegramId}</code>\n` +
          `▸ Chat: <a href="tg://user?id=${telegramId}">Написати юзеру</a>\n` +
          (sub ? `▸ Subscription ID: <code>${sub.id}</code>\n` : '') +
          `▸ Status: ${reason}\n\n` +
          `#inactive`,
          {
            parse_mode: 'HTML',
            message_thread_id: Number(PARTNER.inactiveThreadId) || undefined,
          },
        );
      }
    } catch (err) {
      logger.error('Expire job: failed to send churn notification', err);
    }
  }

  await notifyJobResult(bot, {
    jobName: 'Expire Subscriptions',
    found: allUsersToKick.length,
    success: allUsersToKick.length,
    failed: 0,
    details: `Expired: ${expiredUsers.length}, Cancelled: ${cancelledUsers.length}`,
  });
}
