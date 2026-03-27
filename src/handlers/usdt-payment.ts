import { Telegraf, type Context } from 'telegraf';
import { TEXTS } from '../texts/index.js';
import { PLANS } from '../services/wayforpay.js';
import { createPayment, getPaymentByOrderReference, updatePaymentStatus } from '../db/payments.js';
import { activateSubscription } from '../db/users.js';
import { escapeHtml } from '../utils/html.js';
import { logger } from '../utils/logger.js';

/** Map button text to plan key */
const BUTTON_TO_PLAN: Record<string, string> = {
  [TEXTS.BTN_USDT_1M]: 'usdt_1m',
  [TEXTS.BTN_USDT_6M]: 'usdt_6m',
  [TEXTS.BTN_USDT_12M]: 'usdt_12m',
};

/** Track users waiting to enter transaction hash */
interface HashFormState {
  orderReference: string;
  planKey: string;
  createdAt: number;
}

const waitingForHash = new Map<number, HashFormState>();

const HASH_FORM_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

/** Remove expired hash form entries */
function cleanupExpiredForms() {
  const now = Date.now();
  for (const [userId, state] of waitingForHash) {
    if (now - state.createdAt > HASH_FORM_TTL_MS) {
      waitingForHash.delete(userId);
    }
  }
}

setInterval(cleanupExpiredForms, 5 * 60 * 1000).unref();

/** Generate unique order reference for USDT */
function generateOrderReference(telegramId: number): string {
  return `ME_USDT_${telegramId}_${Date.now()}`;
}

/** Get env vars */
function getWalletAddress(): string {
  return process.env.USDT_WALLET_ADDRESS ?? '';
}

function getAdminChannelId(): string {
  return process.env.USDT_ADMIN_CHANNEL_ID ?? '';
}

function getHashInstructionUrl(): string {
  return process.env.USDT_HASH_INSTRUCTION_URL ?? '';
}

function getTopUpInstructionUrl(): string {
  return process.env.USDT_TOP_UP_INSTRUCTION_URL ?? '';
}

/** Handle USDT tariff button click */
async function handleUsdtTariffClick(ctx: Context, planKey: string): Promise<void> {
  const plan = PLANS[planKey];
  if (!plan || !ctx.from) return;

  const telegramId = ctx.from.id;
  const orderReference = generateOrderReference(telegramId);
  const walletAddress = getWalletAddress();

  if (!walletAddress) {
    logger.error('USDT_WALLET_ADDRESS not configured');
    await ctx.reply('⚠️ Оплата USDT тимчасово недоступна. Спробуй пізніше.');
    return;
  }

  try {
    await createPayment({
      telegramId,
      amount: plan.amount,
      currency: plan.currency,
      method: 'usdt',
      plan: planKey,
      orderReference,
    });

    // Save state — waiting for hash after user pays
    waitingForHash.set(telegramId, {
      orderReference,
      planKey,
      createdAt: Date.now(),
    });

    // Show order details
    await ctx.reply(
      `Номер замовлення:\n<code>${escapeHtml(orderReference)}</code>\n\n` +
      `📦 ${escapeHtml(plan.label)}\n` +
      `💰 Сума: ${plan.amount} USDT`,
      { parse_mode: 'HTML' },
    );

    // Show wallet address (copyable)
    await ctx.reply('Надішли USDT у мережі TRC-20 на адресу:');
    await ctx.reply(`<code>${escapeHtml(walletAddress)}</code>`, { parse_mode: 'HTML' });

    // Instructions
    await ctx.reply(
      'Прочитай уважно інструкцію 👇\n\n' +
      'Важливо! При переведенні з тебе зніметься комісія, тому конвертуй свою валюту в крипту З ВРАХУВАННЯМ КОМІСІЇ.\n\n' +
      'Після оплати ОБОВ\'ЯЗКОВО скопіюй TxID (Хеш) транзакції ❗️\n' +
      'І ТІЛЬКИ ПІСЛЯ ОПЛАТИ - натисни кнопку "✅ Я оплатив" 👇\n' +
      'Далі дотримуйся інструкцій бота.\n\n' +
      'Виникло питання до підтримки - натисни кнопку "❓ Є питання"',
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Інструкція як дивитись хеш транзакції 🔗', url: getHashInstructionUrl() }],
            [{ text: 'Інструкція як поповняти крипту 🔗', url: getTopUpInstructionUrl() }],
            [{ text: 'Є питання ❓', url: 'https://t.me/MEdopomoga' }],
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
    logger.error('Failed to create USDT payment', err);
    await ctx.reply('⚠️ Помилка створення платежу. Спробуй ще раз.');
  }
}

/** Register USDT payment handlers */
export function registerUsdtPaymentHandler(bot: Telegraf) {
  // USDT tariff buttons
  bot.hears(TEXTS.BTN_USDT_1M, async (ctx) => {
    await handleUsdtTariffClick(ctx, BUTTON_TO_PLAN[TEXTS.BTN_USDT_1M]);
  });

  bot.hears(TEXTS.BTN_USDT_6M, async (ctx) => {
    await handleUsdtTariffClick(ctx, BUTTON_TO_PLAN[TEXTS.BTN_USDT_6M]);
  });

  bot.hears(TEXTS.BTN_USDT_12M, async (ctx) => {
    await handleUsdtTariffClick(ctx, BUTTON_TO_PLAN[TEXTS.BTN_USDT_12M]);
  });

  // "✅ Я ОПЛАТИВ" button
  bot.hears(TEXTS.BTN_USDT_PAID, async (ctx) => {
    const telegramId = ctx.from.id;
    const state = waitingForHash.get(telegramId);

    if (!state) {
      await ctx.reply('У тебе немає активного USDT платежу. Обери тариф спочатку.');
      return;
    }

    // Ask for transaction hash
    await ctx.reply('Відправ будь ласка Transaction ID (хеш)');
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

    // Save hash and send to admin channel
    waitingForHash.delete(telegramId);

    const plan = PLANS[state.planKey];
    const adminChannelId = getAdminChannelId();

    if (!adminChannelId) {
      logger.error('USDT_ADMIN_CHANNEL_ID not configured');
      await ctx.reply('⚠️ Помилка конфігурації. Зверніся в підтримку.');
      return;
    }

    // Update payment with hash info
    await updatePaymentStatus(state.orderReference, 'waiting_confirmation');

    // Tell user we're verifying
    await ctx.reply('USDT транзакція перевіряється, я повідомлю про результат 🔄');

    // Send to admin channel for verification
    try {
      const username = ctx.from.username ? `@${escapeHtml(ctx.from.username)}` : 'немає';
      const threadId = Number(process.env.USDT_ADMIN_THREAD_ID ?? 0) || undefined;
      await bot.telegram.sendMessage(
        adminChannelId,
        `<b>MED usdt - канал</b>\n` +
        `Оплата в USDT потребує підтвердження 👇\n\n` +
        `▸ uid: <code>${telegramId}</code>\n` +
        `▸ username: ${username}\n` +
        `▸ Сума оплати: ${plan?.amount ?? '?'} USDT\n` +
        `▸ План: ${plan?.label ?? state.planKey}\n` +
        `▸ Хеш: <code>${escapeHtml(hash)}</code>\n` +
        `▸ Замовлення: <code>${escapeHtml(state.orderReference)}</code>`,
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

  // Admin approve callback
  bot.action(/^usdt_approve:(.+)$/, async (ctx) => {
    const orderReference = ctx.match[1];
    await handleAdminDecision(ctx, bot, orderReference, true);
  });

  // Admin deny callback
  bot.action(/^usdt_deny:(.+)$/, async (ctx) => {
    const orderReference = ctx.match[1];
    await handleAdminDecision(ctx, bot, orderReference, false);
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

  const payment = await getPaymentByOrderReference(orderReference);
  if (!payment) {
    await ctx.answerCbQuery('Платіж не знайдено');
    return;
  }

  if (payment.status !== 'waiting_confirmation') {
    await ctx.answerCbQuery('Цей платіж вже оброблено');
    return;
  }

  const plan = PLANS[payment.plan];
  const adminUsername = 'from' in ctx && ctx.from?.username ? `@${ctx.from.username}` : 'Admin';

  if (approved) {
    await updatePaymentStatus(orderReference, 'Approved');
    const months = plan?.months ?? 1;
    await activateSubscription(payment.telegram_id, months, null, null);

    // Notify user
    try {
      await bot.telegram.sendMessage(
        payment.telegram_id,
        `✅ Оплата підтверджена!\n\n` +
        `📦 ${plan?.label ?? 'Підписка ME Club'}\n` +
        `💰 ${payment.amount} USDT\n\n` +
        `Дякуємо! Підписка активована 🎉`,
      );
    } catch (err) {
      logger.error('Failed to send USDT approval to user', err);
    }

    // Update admin message
    try {
      await ctx.editMessageText(
        (ctx.callbackQuery && 'message' in ctx.callbackQuery ? (ctx.callbackQuery.message as { text?: string })?.text : '') +
        `\n\n✅ Підтверджено — ${adminUsername}`,
        { parse_mode: 'HTML' },
      );
    } catch {
      // Ignore edit errors
    }
  } else {
    await updatePaymentStatus(orderReference, 'Declined');

    // Notify user
    try {
      await bot.telegram.sendMessage(
        payment.telegram_id,
        `На жаль, ми не можемо підтвердити твій хеш — зверніся у підтримку`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Підтримка 😊', url: 'https://t.me/MEdopomoga' }],
            ],
          },
        },
      );
    } catch (err) {
      logger.error('Failed to send USDT denial to user', err);
    }

    // Update admin message
    try {
      await ctx.editMessageText(
        (ctx.callbackQuery && 'message' in ctx.callbackQuery ? (ctx.callbackQuery.message as { text?: string })?.text : '') +
        `\n\n❌ Не підтверджено — ${adminUsername}`,
        { parse_mode: 'HTML' },
      );
    } catch {
      // Ignore edit errors
    }
  }
}
