import { Telegraf, type Context } from 'telegraf';
import { TEXTS } from '../texts/index.js';
import { getPricesForUser, type PricesSnapshot } from '../services/pricing.js';
import { type PriceRow } from '../db/prices.js';
import { createTransaction, updateTransactionStatus, updateTransactionTxHash, hasPendingCryptoTransaction, hasPendingCardTransaction, isFirstApprovedTransaction } from '../db/transactions.js';
import { getUserByTelegramId } from '../db/users.js';
import { hasActiveSubscription, getCancelledSubscription } from '../db/subscriptions.js';
import { formatDate } from '../services/notifications.js';
import { planDisplayName } from '../services/notifications.js';
import { escapeHtml } from '../utils/html.js';
import { logger } from '../utils/logger.js';
import { createTtlMap } from '../utils/ttl-map.js';
import { buildMainMenuKeyboard } from '../keyboards/index.js';
import { generateOrderReference } from '../utils/order-reference.js';
import { SUPPORT_URL, USDT } from '../config.js';

/** Map duration to crypto plan key */
const DURATION_TO_CRYPTO_KEY: Record<string, string> = {
  '12m': 'crypto_12m',
  '6m': 'crypto_6m',
  '1m': 'crypto_1m',
};

/** Track users waiting to enter transaction hash */
interface HashFormState {
  orderReference: string;
  planKey: string;
  plan: PriceRow;
  prices: PricesSnapshot;
  createdAt: number;
}

/** Users who see payment details but haven't clicked "Я оплатив" yet */
const pendingPayment = createTtlMap<HashFormState>(6 * 60 * 60 * 1000); // 6 hours

/** Users who clicked "Я оплатив" and we're waiting for hash (15 min) */
const waitingForHash = createTtlMap<HashFormState>(15 * 60 * 1000); // 15 minutes


/** Handle crypto payment flow — called from subscription handler via callback */
async function handleCryptoPayment(ctx: Context, duration: string): Promise<void> {
  const planKey = DURATION_TO_CRYPTO_KEY[duration];
  if (!planKey || !ctx.from) return;

  const telegramId = ctx.from.id;

  if (await hasActiveSubscription(telegramId)) {
    await ctx.reply(TEXTS.ALREADY_SUBSCRIBED, {
      reply_markup: {
        inline_keyboard: [
          [{ text: TEXTS.BTN_CHECK_SUBSCRIPTION, callback_data: 'sub:back' }],
        ],
      },
    });
    return;
  }

  const cancelledSub = await getCancelledSubscription(telegramId);
  if (cancelledSub) {
    const expiresDate = formatDate(new Date(cancelledSub.expires_at));
    await ctx.reply(
      TEXTS.CANCELLED_SUB_INFO.replace('{expiresDate}', expiresDate),
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: TEXTS.BTN_REACTIVATE, callback_data: 'sub:reactivate' }],
          ],
        },
      },
    );
    return;
  }

  const prices = await getPricesForUser(telegramId);
  const plan = prices[planKey];
  if (!plan) return;

  // Block if user already has a pending crypto payment (WaitingConfirmation = hash submitted)
  if (await hasPendingCryptoTransaction(telegramId)) {
    await ctx.reply(TEXTS.PENDING_CRYPTO_PAYMENT);
    return;
  }

  // Block if user already has a pending card payment
  if (await hasPendingCardTransaction(telegramId)) {
    await ctx.reply(TEXTS.USDT_PENDING_CARD);
    return;
  }

  const orderReference = generateOrderReference(telegramId, 'crypto');
  const walletAddress = USDT.walletAddress;

  if (!walletAddress) {
    logger.error('USDT_WALLET_ADDRESS not configured');
    await ctx.reply(TEXTS.USDT_PAYMENT_UNAVAILABLE);
    return;
  }

  try {
    // Save state — user sees payment details, hasn't paid yet
    pendingPayment.set(telegramId, {
      orderReference,
      planKey,
      plan,
      prices,
      createdAt: Date.now(),
    });

    // Single message with all payment info
    await ctx.reply(
      TEXTS.USDT_PAYMENT_INSTRUCTIONS
        .replaceAll('{planName}', escapeHtml(plan.display_name))
        .replaceAll('{amount}', String(plan.amount))
        .replace('{wallet}', escapeHtml(walletAddress)),
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: TEXTS.BTN_HASH_INSTRUCTION, url: TEXTS.USDT_HASH_INSTRUCTION_URL }],
            [{ text: TEXTS.BTN_TOP_UP_INSTRUCTION, url: TEXTS.USDT_TOP_UP_INSTRUCTION_URL }],
            [{ text: TEXTS.BTN_QUESTION, url: SUPPORT_URL }],
          ],
        },
      },
    );

    // Bottom keyboard with "Я ОПЛАТИВ" button
    await ctx.reply(TEXTS.CONTINUE_PROMPT, {
      reply_markup: {
        keyboard: [
          [{ text: TEXTS.BTN_USDT_PAID }],
          [{ text: TEXTS.BTN_HOME }],
        ],
        resize_keyboard: true,
      },
    });
  } catch (err) {
    logger.error('Failed to create crypto payment', err);
    await ctx.reply(TEXTS.PAYMENT_CREATION_ERROR);
  }
}

/**
 * Send crypto payment reminder to a user via bot.telegram.
 * Used by crypto-reminder job for auto-renewal reminders.
 * Shows compact message with wallet address + "Як оплатити?" button for instructions.
 * Sets pendingPayment state so "Я оплатив" flow works.
 */
export async function sendCryptoPaymentReminder(bot: Telegraf, telegramId: number, planKey: string): Promise<void> {
  const prices = await getPricesForUser(telegramId);
  const plan = prices[planKey] as PriceRow | undefined;
  if (!plan) return;

  const walletAddress = USDT.walletAddress;
  if (!walletAddress) return;

  const orderReference = generateOrderReference(telegramId, 'crypto');

  pendingPayment.set(telegramId, {
    orderReference,
    planKey,
    plan,
    prices,
    createdAt: Date.now(),
  });

  await bot.telegram.sendMessage(
    telegramId,
    TEXTS.CRYPTO_RENEWAL_REMINDER
      .replaceAll('{planName}', escapeHtml(plan.display_name))
      .replaceAll('{amount}', String(plan.amount))
      .replace('{wallet}', escapeHtml(walletAddress)),
    {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: TEXTS.BTN_HOW_TO_PAY, callback_data: 'crypto_renew:how_to_pay' }],
        ],
      },
    },
  );

  await bot.telegram.sendMessage(
    telegramId,
    TEXTS.CONTINUE_PROMPT,
    {
      reply_markup: {
        keyboard: [
          [{ text: TEXTS.BTN_USDT_PAID }],
          [{ text: TEXTS.BTN_HOME }],
        ],
        resize_keyboard: true,
      },
    },
  );
}

/** Register crypto payment handlers */
export function registerUsdtPaymentHandler(bot: Telegraf) {
  // Crypto payment selected from inline flow (pay:usdt:12m, pay:usdt:6m, pay:usdt:1m)
  bot.action(/^pay:usdt:(\w+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.deleteMessage().catch(() => {});
    const duration = ctx.match[1];
    await handleCryptoPayment(ctx, duration);
  });

  // "Як оплатити?" — show instructions for crypto renewal reminder
  bot.action('crypto_renew:how_to_pay', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.editMessageText(
      TEXTS.USDT_HOW_TO_PAY,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: TEXTS.BTN_HASH_INSTRUCTION, url: TEXTS.USDT_HASH_INSTRUCTION_URL }],
            [{ text: TEXTS.BTN_TOP_UP_INSTRUCTION, url: TEXTS.USDT_TOP_UP_INSTRUCTION_URL }],
            [{ text: TEXTS.BTN_SUPPORT, url: SUPPORT_URL }],
            [{ text: TEXTS.BTN_BACK, callback_data: 'crypto_renew:back' }],
          ],
        },
      },
    );
  });

  // Back from "Як оплатити?" — restore the compact payment message
  bot.action('crypto_renew:back', async (ctx) => {
    await ctx.answerCbQuery();
    const telegramId = ctx.from.id;
    let state = pendingPayment.get(telegramId);

    // If state lost (bot restarted), recreate from active subscription
    if (!state) {
      const { getActiveSubscription } = await import('../db/subscriptions.js');
      const sub = await getActiveSubscription(telegramId);
      if (sub && sub.method === 'crypto' && sub.prices) {
        const prices = sub.prices as PricesSnapshot;
        const plan = prices[sub.plan] as PriceRow | undefined;
        if (plan) {
          const orderReference = generateOrderReference(telegramId, 'crypto');
          state = { orderReference, planKey: sub.plan, plan, prices, createdAt: Date.now() };
          pendingPayment.set(telegramId, state);
        }
      }
    }

    if (!state) {
      await ctx.editMessageText(TEXTS.DATA_LOAD_ERROR);
      return;
    }

    const walletAddress = USDT.walletAddress;
    await ctx.editMessageText(
      TEXTS.CRYPTO_RENEWAL_REMINDER
        .replaceAll('{planName}', escapeHtml(state.plan.display_name))
        .replaceAll('{amount}', String(state.plan.amount))
        .replace('{wallet}', escapeHtml(walletAddress)),
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: TEXTS.BTN_HOW_TO_PAY, callback_data: 'crypto_renew:how_to_pay' }],
          ],
        },
      },
    );
  });

  // "✅ Я ОПЛАТИВ" button — move from pendingPayment to waitingForHash
  bot.hears(TEXTS.BTN_USDT_PAID, async (ctx) => {
    const telegramId = ctx.from.id;
    let state = pendingPayment.get(telegramId);

    // If state lost (bot restarted / TTL expired), try to recreate from active subscription
    if (!state) {
      if (await hasPendingCryptoTransaction(telegramId)) {
        await ctx.reply(TEXTS.CRYPTO_PAYMENT_UNDER_REVIEW);
        return;
      }

      const { getActiveSubscription } = await import('../db/subscriptions.js');
      const sub = await getActiveSubscription(telegramId);
      if (sub && sub.method === 'crypto' && sub.prices) {
        // Only allow if subscription expires within 2 days
        const daysLeft = (sub.expires_at.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
        if (daysLeft <= 2) {
          const prices = sub.prices as PricesSnapshot;
          const plan = prices[sub.plan] as PriceRow | undefined;
          if (plan) {
            const orderReference = generateOrderReference(telegramId, 'crypto');
            state = { orderReference, planKey: sub.plan, plan, prices, createdAt: Date.now() };
          }
        }
      }

      if (!state) {
        await ctx.reply(TEXTS.CRYPTO_NO_ACTIVE_PAYMENT);
        return;
      }
    }

    // Move to waitingForHash (15 min TTL)
    pendingPayment.delete(telegramId);
    waitingForHash.set(telegramId, state);

    // Ask for transaction hash + show cancel button
    await ctx.reply(TEXTS.CRYPTO_ENTER_HASH, {
      reply_markup: {
        keyboard: [
          [{ text: TEXTS.BTN_USDT_CANCEL }],
          [{ text: TEXTS.BTN_HOME }],
        ],
        resize_keyboard: true,
      },
    });
  });

  // "❌ Скасувати оплату" button
  bot.hears(TEXTS.BTN_USDT_CANCEL, async (ctx) => {
    const telegramId = ctx.from.id;

    // Clear both states
    pendingPayment.delete(telegramId);
    waitingForHash.delete(telegramId);

    await ctx.reply(TEXTS.CRYPTO_PAYMENT_CANCELLED, {
      reply_markup: buildMainMenuKeyboard(false),
    });
  });

  // Handle text messages — check if user is sending a transaction hash
  bot.on('text', async (ctx, next) => {
    const telegramId = ctx.from.id;
    const state = waitingForHash.get(telegramId);

    if (!state) {
      return next();
    }

    const hash = ctx.message.text.trim();

    // Basic validation — hash should be a non-empty string, not a button text
    const allButtonTexts = Object.values(TEXTS);
    if (!hash || allButtonTexts.includes(hash)) {
      return next();
    }

    // Clear waiting state
    waitingForHash.delete(telegramId);

    const adminChannelId = USDT.adminChannelId;

    if (!adminChannelId) {
      logger.error('USDT_ADMIN_CHANNEL_ID not configured');
      await ctx.reply(TEXTS.CONFIG_ERROR);
      return;
    }

    // Create transaction and save hash
    const tx = await createTransaction({
      telegramId,
      amount: state.plan.amount,
      currency: state.plan.currency,
      method: 'crypto',
      plan: state.planKey,
      orderReference: state.orderReference,
    });
    await updateTransactionTxHash(state.orderReference, hash);
    await updateTransactionStatus(state.orderReference, 'WaitingConfirmation');

    // Tell user we're sending for verification
    await ctx.reply(
      TEXTS.CRYPTO_HASH_SUBMITTED,
      { reply_markup: buildMainMenuKeyboard(false) },
    );

    // Send to admin channel for manual verification
    try {
      const user = await getUserByTelegramId(telegramId);
      const username = ctx.from.username ? `@${escapeHtml(ctx.from.username)}` : TEXTS.USERNAME_NONE;
      const isFirst = await isFirstApprovedTransaction(telegramId, state.orderReference);
      const tag = isFirst ? '#first_subscription' : '#renew';
      const threadId = Number(USDT.adminThreadId) || undefined;
      await bot.telegram.sendMessage(
        adminChannelId,
        `<b>ME USDT - перевірка</b>\n` +
        `Оплата в USDT потребує підтвердження 👇\n\n` +
        `▸ User ID: <code>${user?.id ?? 'N/A'}</code>\n` +
        `▸ Username: ${username}\n` +
        `▸ Transaction ID: <code>${tx.id}</code>\n` +
        `▸ Plan: ${planDisplayName(state.planKey)}\n` +
        `▸ Amount: ${state.plan.amount} ${escapeHtml(state.plan.currency)}\n` +
        `▸ Hash: <code>${escapeHtml(hash)}</code>\n\n` +
        tag,
        {
          parse_mode: 'HTML',
          message_thread_id: threadId,
          reply_markup: {
            inline_keyboard: [
              [
                { text: '❌ Не підтверджено', callback_data: `usdt_deny:${state.orderReference}` },
                { text: '✅ Підтверджено', callback_data: `usdt_approve:${state.orderReference}` },
              ],
            ],
          },
        },
      );
    } catch (err) {
      logger.error('Failed to send USDT verification to admin channel', err);
      await ctx.reply(TEXTS.CRYPTO_VERIFICATION_ERROR);
    }
  });

  // Note: admin approve/deny callbacks are in usdt-admin.ts
}
