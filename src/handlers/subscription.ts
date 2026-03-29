import { Telegraf, type Context } from 'telegraf';
import { buildTariffKeyboard, paymentMethodKeyboard } from '../keyboards/index.js';
import { TEXTS } from '../texts/index.js';
import { getPricesForUser } from '../services/pricing.js';
import { createTransaction, hasPendingCardTransaction } from '../db/transactions.js';
import { logger } from '../utils/logger.js';
import { generateOrderReference } from '../utils/order-reference.js';
import { planLabel } from '../services/pricing.js';

/** Map duration code to plan keys and detail text key */
const DURATION_MAP: Record<string, { card: string; crypto: string; detailKey: keyof typeof TEXTS }> = {
  '12m': { card: 'card_12m', crypto: 'crypto_12m', detailKey: 'TARIFF_DETAIL_12M' },
  '6m':  { card: 'card_6m',  crypto: 'crypto_6m',  detailKey: 'TARIFF_DETAIL_6M' },
  '1m':  { card: 'card_1m',  crypto: 'crypto_1m',  detailKey: 'TARIFF_DETAIL_1M' },
};

/** Show tariff selection inline keyboard (new message) */
async function showTariffs(ctx: Context) {
  if (!ctx.from) return;
  const prices = await getPricesForUser(ctx.from.id);
  await ctx.reply(TEXTS.TARIFF_TITLE, {
    parse_mode: 'HTML',
    reply_markup: buildTariffKeyboard(prices),
  });
}

/** Handle card payment — create payment and send payment link */
async function handleCardPayment(ctx: Context, duration: string): Promise<void> {
  const info = DURATION_MAP[duration];
  if (!info || !ctx.from) return;

  const telegramId = ctx.from.id;

  if (await hasPendingCardTransaction(telegramId)) {
    await ctx.reply('У тебе вже є активний платіж. Скористайся попереднім посиланням або зачекай 15 хвилин.');
    return;
  }

  const prices = await getPricesForUser(telegramId);
  const plan = prices[info.card];
  if (!plan) return;

  const orderReference = generateOrderReference(telegramId, 'card');
  const webhookBaseUrl = process.env.WEBHOOK_BASE_URL;

  if (!webhookBaseUrl) {
    logger.error('WEBHOOK_BASE_URL not configured');
    await ctx.reply('⚠️ Оплата тимчасово недоступна. Спробуй пізніше.');
    return;
  }

  try {
    await createTransaction({
      telegramId,
      amount: plan.amount,
      currency: plan.currency,
      method: 'card',
      plan: info.card,
      orderReference,
    });

    const paymentUrl = `${webhookBaseUrl}/pay/${orderReference}`;

    await ctx.reply(
      `💳 Оплата: ${planLabel(info.card)}\n💰 Сума: ${plan.amount} ${plan.currency}\n\nНатисни кнопку нижче для оплати 👇`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '💳 Оплатити', url: paymentUrl }],
          ],
        },
      },
    );
  } catch (err) {
    logger.error('Failed to create payment', err);
    await ctx.reply('⚠️ Помилка створення платежу. Спробуй ще раз.');
  }
}

/** Register subscription flow handlers */
export function registerSubscriptionHandler(bot: Telegraf) {
  // "Тарифні плани" reply keyboard button → new message with tariffs
  bot.hears(TEXTS.BTN_SUBSCRIPTION, async (ctx) => {
    await showTariffs(ctx);
  });

  // "ВХІД В ME CLUB" inline button or "Моя підписка" → edit existing message
  bot.action('subscription', async (ctx) => {
    await ctx.answerCbQuery();
    if (!ctx.from) return;
    const prices = await getPricesForUser(ctx.from.id);
    await ctx.editMessageText(TEXTS.TARIFF_TITLE, {
      parse_mode: 'HTML',
      reply_markup: buildTariffKeyboard(prices),
    });
  });

  // Step 1: Tariff selected → show payment method
  bot.action(/^tariff:(\w+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (!ctx.from) return;
    const duration = ctx.match[1];
    const info = DURATION_MAP[duration];
    if (!info) return;

    const prices = await getPricesForUser(ctx.from.id);
    const cardPlan = prices[info.card];
    const cryptoPlan = prices[info.crypto];

    const text =
      (TEXTS[info.detailKey] ?? '') + '\n\n' +
      `💳 Карткою: ${cardPlan?.amount ?? '?'} ${cardPlan?.currency ?? 'UAH'}\n` +
      `⚡️ USDT: ${cryptoPlan?.amount ?? '?'} USDT\n\n` +
      (TEXTS.PAYMENT_METHOD_TITLE ?? 'Обери спосіб оплати:');

    await ctx.editMessageText(text, {
      parse_mode: 'HTML',
      reply_markup: paymentMethodKeyboard(duration),
    });
  });

  // Step 2: Card payment selected → create payment and send link
  bot.action(/^pay:card:(\w+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const duration = ctx.match[1];
    await handleCardPayment(ctx, duration);
  });
  // Note: pay:usdt:* is handled in usdt-payment handler

  // Back to tariffs
  bot.action('back:tariffs', async (ctx) => {
    await ctx.answerCbQuery();
    if (!ctx.from) return;
    const prices = await getPricesForUser(ctx.from.id);
    await ctx.editMessageText(TEXTS.TARIFF_TITLE, {
      parse_mode: 'HTML',
      reply_markup: buildTariffKeyboard(prices),
    });
  });

  // Back to about/start screen (from inline tariff selection)
  bot.action('back:main', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.editMessageText(TEXTS.ABOUT, {
      reply_markup: {
        inline_keyboard: [
          [{ text: TEXTS.BTN_SUBSCRIPTION_INLINE, callback_data: 'subscription' }],
        ],
      },
    });
  });

  // Note: BTN_HOME handler is in navigation.ts
}
