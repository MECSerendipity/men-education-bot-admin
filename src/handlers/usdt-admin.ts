import { Telegraf, type Context } from 'telegraf';
import { getTransactionByOrderReference, claimTransaction, isFirstApprovedTransaction } from '../db/transactions.js';
import { activateSubscription, hasActiveSubscription } from '../db/subscriptions.js';
import { getPricesForUser, daysFromPlanKey } from '../services/pricing.js';
import { deleteOffersForUser } from '../db/prices.js';
import { logger } from '../utils/logger.js';
import { SUPPORT_URL } from '../config.js';
import { sendRulesOrInvite } from './rules.js';
import { getUserByTelegramId } from '../db/users.js';
import { planDisplayName, buildPaymentSuccessMessage } from '../services/notifications.js';
import { escapeHtml } from '../utils/html.js';
import { processPartnerCommission } from '../services/partner.js';

/** Register admin approval/denial handlers for USDT payments */
export function registerUsdtAdminHandler(bot: Telegraf) {
  bot.action(/^usdt_approve:(.+)$/, async (ctx) => {
    await handleAdminDecision(ctx, bot, ctx.match[1], true);
  });

  bot.action(/^usdt_deny:(.+)$/, async (ctx) => {
    await handleAdminDecision(ctx, bot, ctx.match[1], false);
  });
}

/** Handle admin confirm/deny decision */
async function handleAdminDecision(
  ctx: Context,
  bot: Telegraf,
  orderReference: string,
  approved: boolean,
): Promise<void> {
  const payment = await getTransactionByOrderReference(orderReference);
  if (!payment) {
    await ctx.answerCbQuery('Платіж не знайдено');
    return;
  }

  // Atomically claim the transaction — prevents double-approval race condition
  const newStatus = approved ? 'Approved' : 'Declined';
  const claimed = await claimTransaction(orderReference, 'WaitingConfirmation', newStatus);
  if (!claimed) {
    await ctx.answerCbQuery('Цей платіж вже оброблено');
    return;
  }

  await ctx.answerCbQuery();

  const adminUsername = ctx.from?.username ? `@${ctx.from.username}` : 'Admin';
  const user = await getUserByTelegramId(payment.telegram_id);
  const username = user?.username ? `@${escapeHtml(user.username)}` : 'немає';
  const isFirst = await isFirstApprovedTransaction(payment.telegram_id, orderReference);
  const tag = isFirst ? '#first_subscription' : '#renew';
  const hashDisplay = payment.tx_hash ? `<code>${escapeHtml(payment.tx_hash)}</code>` : 'N/A';

  if (approved) {
    const days = daysFromPlanKey(payment.plan);

    // Check if this is a renewal before activating
    const isRenewal = await hasActiveSubscription(payment.telegram_id);

    const prices = await getPricesForUser(payment.telegram_id);
    const subscription = await activateSubscription({
      telegramId: payment.telegram_id,
      plan: payment.plan,
      method: 'crypto',
      days,
      transactionId: payment.id,
      prices,
    });
    await deleteOffersForUser(payment.telegram_id);

    try {
      const successText = buildPaymentSuccessMessage({
        plan: payment.plan,
        amount: payment.amount,
        currency: payment.currency,
        expiresAt: subscription.expires_at,
        isRenewal,
      });
      await bot.telegram.sendMessage(payment.telegram_id, successText);
    } catch (err) {
      logger.error('Failed to send USDT approval to user', err);
    }

    // Send rules or invite link only for new subscriptions
    if (!isRenewal) {
      await sendRulesOrInvite(bot, payment.telegram_id);
    }

    // Process partner commission
    await processPartnerCommission(bot, {
      referredTelegramId: payment.telegram_id,
      transactionId: payment.id,
      paymentAmount: payment.amount,
      paymentCurrency: payment.currency,
    });

    try {
      await ctx.editMessageText(
        `<b>ME USDT - оплата:</b>\n\n` +
        `▸ User ID: <code>${user?.id ?? 'N/A'}</code>\n` +
        `▸ Username: ${username}\n` +
        `▸ Subscription ID: <code>${subscription.id}</code>\n` +
        `▸ Transaction ID: <code>${payment.id}</code>\n` +
        `▸ Plan: ${planDisplayName(payment.plan)}\n` +
        `▸ Amount: ${payment.amount} ${escapeHtml(payment.currency)}\n` +
        `▸ Hash: ${hashDisplay}\n` +
        `▸ Status: \u{2705} Approved by ${adminUsername}\n\n` +
        tag,
        { parse_mode: 'HTML' },
      );
    } catch { /* ignore edit errors */ }
  } else {
    try {
      await bot.telegram.sendMessage(
        payment.telegram_id,
        'На жаль, ми не можемо підтвердити твій хеш — зверніся у підтримку\n' +
        'Статус: Не підтверджено ❌',
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Підтримка 😊', url: SUPPORT_URL }],
            ],
          },
        },
      );
    } catch (err) {
      logger.error('Failed to send USDT denial to user', err);
    }

    try {
      await ctx.editMessageText(
        `<b>ME USDT - оплата:</b>\n\n` +
        `▸ User ID: <code>${user?.id ?? 'N/A'}</code>\n` +
        `▸ Username: ${username}\n` +
        `▸ Transaction ID: <code>${payment.id}</code>\n` +
        `▸ Plan: ${planDisplayName(payment.plan)}\n` +
        `▸ Amount: ${payment.amount} ${escapeHtml(payment.currency)}\n` +
        `▸ Hash: ${hashDisplay}\n` +
        `▸ Status: \u{274C} Rejected by ${adminUsername}\n\n` +
        tag,
        { parse_mode: 'HTML' },
      );
    } catch { /* ignore edit errors */ }
  }
}
