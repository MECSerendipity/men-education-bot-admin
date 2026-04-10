import { Telegraf, type Context } from 'telegraf';
import { TEXTS } from '../texts/index.js';
import { getPricesForUser, type PricesSnapshot } from '../services/pricing.js';
import { type PriceRow } from '../db/prices.js';
import { createTransaction, updateTransactionStatus, updateTransactionTxHash, hasPendingCryptoTransaction, isFirstApprovedTransaction } from '../db/transactions.js';
import { getUserByTelegramId } from '../db/users.js';
import { hasActiveSubscription, getCancelledSubscription } from '../db/subscriptions.js';
import { formatDate } from '../services/notifications.js';
import { planDisplayName } from '../services/notifications.js';
import { escapeHtml } from '../utils/html.js';
import { logger } from '../utils/logger.js';
import { createTtlMap } from '../utils/ttl-map.js';
import { MAIN_MENU_KEYBOARD } from '../keyboards/index.js';
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
    await ctx.reply('\u{2705} У тебе вже є активна підписка!', {
      reply_markup: {
        inline_keyboard: [
          [{ text: '\u{1F4CB} Перевірити підписку', callback_data: 'sub:back' }],
        ],
      },
    });
    return;
  }

  const cancelledSub = await getCancelledSubscription(telegramId);
  if (cancelledSub) {
    const expiresDate = formatDate(new Date(cancelledSub.expires_at));
    await ctx.reply(
      `\u{26A0}\u{FE0F} Твоя підписка скасована\n\n` +
      `\u{1F5D3}\u{FE0F} Доступ дійсний до: ${expiresDate}\n\n` +
      `\u{1F4A1} Ти можеш відновити підписку зі збереженням поточної ціни до кінця оплаченого періоду.`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '\u{2705} Відновити підписку', callback_data: 'sub:reactivate' }],
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
    await ctx.reply('У тебе вже є активний USDT платіж. Дочекайся його обробки.');
    return;
  }

  const orderReference = generateOrderReference(telegramId, 'crypto');
  const walletAddress = USDT.walletAddress;

  if (!walletAddress) {
    logger.error('USDT_WALLET_ADDRESS not configured');
    await ctx.reply('⚠️ Оплата USDT тимчасово недоступна. Спробуй пізніше.');
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
      'Прочитай уважно інструкцію 👇\n\n' +
      'Важливо! При переведенні з тебе зніметься комісія, тому конвертуй свою валюту в крипту З ВРАХУВАННЯМ КОМІСІЇ.\n\n' +
      'Після оплати ОБОВ\'ЯЗКОВО скопіюй TxID (Хеш) транзакції ❗️\n' +
      'І ТІЛЬКИ ПІСЛЯ ОПЛАТИ - натисни кнопку "✅ Я оплатив" 👇\n' +
      'Далі дотримуйся інструкцій бота.\n\n' +
      'Виникло питання до підтримки - натисни кнопку "Є питання❓"\n\n' +
      '━━━━━━━━━━━━━━━━━━━━\n\n' +
      `📦 ${escapeHtml(plan.display_name)}\n` +
      `ℹ️ Сума оплати — ${plan.amount} USDT\n\n` +
      'Монета: Tether (USDT)\n' +
      'Мережа: TRON — TRC20\n\n' +
      `До сплати: <b>${plan.amount} USDT</b>\n\n` +
      'Тисни на адресу, щоб скопіювати 👇\n' +
      `<code>${escapeHtml(walletAddress)}</code>`,
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Інструкція як дивитись хеш транзакції 🔗', url: USDT.hashInstructionUrl }],
            [{ text: 'Інструкція як поповняти крипту 🔗', url: USDT.topUpInstructionUrl }],
            [{ text: 'Є питання ❓', url: SUPPORT_URL }],
          ],
        },
      },
    );

    // Bottom keyboard with "Я ОПЛАТИВ" button
    await ctx.reply('Продовжимо? 👇', {
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
    await ctx.reply('⚠️ Помилка створення платежу. Спробуй ще раз.');
  }
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

  // "✅ Я ОПЛАТИВ" button — move from pendingPayment to waitingForHash
  bot.hears(TEXTS.BTN_USDT_PAID, async (ctx) => {
    const telegramId = ctx.from.id;
    const state = pendingPayment.get(telegramId);

    if (!state) {
      if (await hasPendingCryptoTransaction(telegramId)) {
        await ctx.reply('Твій USDT платіж вже на перевірці. Очікуй відповіді.');
        return;
      }
      await ctx.reply('У тебе немає активного USDT платежу. Обери тариф спочатку.');
      return;
    }

    // Move to waitingForHash (15 min TTL)
    pendingPayment.delete(telegramId);
    waitingForHash.set(telegramId, state);

    // Ask for transaction hash + show cancel button
    await ctx.reply('Відправ будь ласка Transaction ID (хеш) 👇', {
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

    await ctx.reply('Оплату скасовано.', {
      reply_markup: MAIN_MENU_KEYBOARD,
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
      await ctx.reply('⚠️ Помилка конфігурації. Зверніся в підтримку.');
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
      'Дякую! Передаю на перевірку адміністратору. Очікуй відповіді 🔄\n\n' +
      'USDT транзакція перевіряється, я повідомлю про результат.\n' +
      'Статус: Перевіряється 🔄',
      { reply_markup: MAIN_MENU_KEYBOARD },
    );

    // Send to admin channel for manual verification
    try {
      const user = await getUserByTelegramId(telegramId);
      const username = ctx.from.username ? `@${escapeHtml(ctx.from.username)}` : 'немає';
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
      await ctx.reply('⚠️ Помилка відправки на перевірку. Зверніся в підтримку @MEdopomoga');
    }
  });

  // Note: admin approve/deny callbacks are in usdt-admin.ts
}
