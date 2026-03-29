import { Telegraf, type Context } from 'telegraf';
import { getTransactionByOrderReference, claimTransaction } from '../db/transactions.js';
import { activateSubscription } from '../db/subscriptions.js';
import { getPricesForUser, daysFromPlanKey } from '../services/pricing.js';
import { deleteOffersForUser } from '../db/prices.js';
import { logger } from '../utils/logger.js';
import { SUPPORT_URL } from '../config.js';
import { sendRulesOrInvite } from './rules.js';

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
  await ctx.answerCbQuery();

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

  const adminUsername = ctx.from?.username ? `@${ctx.from.username}` : 'Admin';
  const originalText = ctx.callbackQuery && 'message' in ctx.callbackQuery
    ? (ctx.callbackQuery.message as { text?: string })?.text ?? ''
    : '';

  if (approved) {
    const days = daysFromPlanKey(payment.plan);
    const prices = await getPricesForUser(payment.telegram_id);
    await activateSubscription({
      telegramId: payment.telegram_id,
      plan: payment.plan,
      method: 'crypto',
      days,
      transactionId: payment.id,
      prices,
    });
    await deleteOffersForUser(payment.telegram_id);

    try {
      await bot.telegram.sendMessage(
        payment.telegram_id,
        'Твоя оплата підтверджена\n' +
        'Статус: Підтверджено ✅\n\n' +
        `📦 ${payment.amount} USDT\n\n` +
        'Дякуємо! Підписка активована 🎉',
      );
    } catch (err) {
      logger.error('Failed to send USDT approval to user', err);
    }

    await sendRulesOrInvite(bot, payment.telegram_id);

    try {
      await ctx.editMessageText(
        originalText + `\n\n✅ Підтверджено — ${adminUsername}`,
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
        originalText + `\n\n❌ Не підтверджено — ${adminUsername}`,
        { parse_mode: 'HTML' },
      );
    } catch { /* ignore edit errors */ }
  }
}
