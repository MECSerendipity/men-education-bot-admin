import { Telegraf, type Context } from 'telegraf';
import { buildTariffKeyboard, paymentMethodKeyboard } from '../keyboards/index.js';
import { TEXTS } from '../texts/index.js';
import { getPricesForUser } from '../services/pricing.js';
import { createTransaction, hasPendingCardTransaction, updateTransactionStatus } from '../db/transactions.js';
import { createInvoice, removeInvoice } from '../services/wayforpay.js';
import { logger } from '../utils/logger.js';
import { generateOrderReference } from '../utils/order-reference.js';

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

/** Handle card payment — create invoice via WayForPay API and send payment link */
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

  try {
    await createTransaction({
      telegramId,
      amount: plan.amount,
      currency: plan.currency,
      method: 'card',
      plan: info.card,
      orderReference,
    });

    const result = await createInvoice({
      orderReference,
      amount: plan.amount,
      currency: plan.currency,
      productName: 'Підписка ME Club',
      clientAccountId: `uid:${telegramId}`,
    });

    if (!result.success || !result.invoiceUrl) {
      logger.error('Failed to create WayForPay invoice', { orderReference, reason: result.reason });
      await ctx.reply('⚠️ Оплата тимчасово недоступна. Спробуй пізніше.');
      return;
    }

    await ctx.reply(
      `Номер замовлення\n${orderReference}`,
    );

    await ctx.reply(
      `💳 ${plan.display_name}\n💰 Сума: ${plan.amount} ${plan.currency}`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '💳 Оплатити', url: result.invoiceUrl },
              { text: 'Відміна', callback_data: `cancel_invoice:${orderReference}` },
            ],
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

  // Step 2: Card payment selected → delete selection message, create payment and send link
  bot.action(/^pay:card:(\w+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.deleteMessage().catch(() => {});
    const duration = ctx.match[1];
    await handleCardPayment(ctx, duration);
  });
  // Note: pay:usdt:* is handled in usdt-payment handler

  // Cancel invoice — remove WayForPay invoice and cancel transaction
  bot.action(/^cancel_invoice:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const orderReference = ctx.match[1];

    await removeInvoice(orderReference);
    await updateTransactionStatus(orderReference, 'Cancelled');

    await ctx.editMessageText('Платіж скасовано');
  });

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
