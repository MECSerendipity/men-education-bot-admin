import { Telegraf, type Context } from 'telegraf';
import { buildTariffKeyboard, paymentMethodKeyboard } from '../keyboards/index.js';
import { TEXTS } from '../texts/index.js';
import { getPricesForUser } from '../services/pricing.js';
import { createTransaction, hasPendingCardTransaction, hasPendingCryptoTransaction, updateTransactionStatus, updateTransactionCard, updateTransactionDeclineReason } from '../db/transactions.js';
import { hasActiveSubscription, getCancelledSubscription, activateSubscription, type Subscription } from '../db/subscriptions.js';
import { formatDate, planDisplayName, buildPaymentSuccessMessage, buildRetryFailedMessage } from '../services/notifications.js';
import { sendPaymentNotification } from '../services/notifications.js';
import { getUserByTelegramId } from '../db/users.js';
import { processPartnerCommission } from '../services/partner.js';
import { daysFromPlanKey } from '../services/pricing.js';
import { createInvoice, removeInvoice, chargeWithToken } from '../services/wayforpay.js';
import { logger } from '../utils/logger.js';
import { generateOrderReference } from '../utils/order-reference.js';
import { savePaymentMessage, deletePaymentMessage } from '../utils/payment-messages.js';

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

  if (await hasPendingCardTransaction(telegramId)) {
    await ctx.reply(TEXTS.PENDING_CARD_PAYMENT);
    return;
  }

  if (await hasPendingCryptoTransaction(telegramId)) {
    await ctx.reply(TEXTS.PENDING_CRYPTO_PAYMENT);
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
      await ctx.reply(TEXTS.PAYMENT_UNAVAILABLE);
      return;
    }

    const paymentMsg = await ctx.reply(
      TEXTS.PAYMENT_INVOICE_TEMPLATE
        .replace('{planName}', plan.display_name)
        .replace('{amount}', String(plan.amount))
        .replace('{currency}', plan.currency) +
      '\n' + TEXTS.PAYMENT_LINK_VALIDITY,
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [
              { text: TEXTS.BTN_PAY, url: result.invoiceUrl },
              { text: TEXTS.BTN_CANCEL, callback_data: `cancel_invoice:${orderReference}` },
            ],
          ],
        },
      },
    );

    savePaymentMessage(orderReference, paymentMsg.chat.id, paymentMsg.message_id);
  } catch (err) {
    logger.error('Failed to create payment', err);
    await ctx.reply(TEXTS.PAYMENT_CREATION_ERROR);
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
      TEXTS.PAYMENT_METHOD_TITLE;

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
    deletePaymentMessage(orderReference);

    await ctx.editMessageText(
      TEXTS.PAYMENT_CANCELLED,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: TEXTS.BTN_CHOOSE_TARIFF, callback_data: 'subscription' }],
          ],
        },
      },
    );
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

  // Retry charge — manual retry after failed auto-renewal
  bot.action(/^retry_charge:(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const subscriptionId = Number(ctx.match[1]);
    const telegramId = ctx.from.id;

    // Fetch subscription — must belong to the calling user
    const { db } = await import('../db/index.js');
    const subResult = await db.query(
      `SELECT * FROM subscriptions WHERE id = $1 AND telegram_id = $2 AND status = 'Active' AND rec_token IS NOT NULL`,
      [subscriptionId, telegramId],
    );
    const sub = subResult.rows[0] as Subscription | undefined;

    if (!sub || !sub.rec_token || !sub.prices) {
      await ctx.editMessageText(TEXTS.SUBSCRIPTION_NOT_FOUND);
      return;
    }

    const prices = sub.prices as Record<string, { amount: number; currency: string; days: number; display_name?: string }>;
    const planPrice = prices[sub.plan];
    if (!planPrice) {
      await ctx.editMessageText(TEXTS.PLAN_DETERMINATION_ERROR);
      return;
    }

    // Prevent double-charge: check if there's a recent successful or pending charge for this subscription
    const recentCharge = await db.query(
      `SELECT 1 FROM transactions
       WHERE telegram_id = $1 AND method = 'card' AND status IN ('Approved', 'Pending')
         AND created_at > NOW() - INTERVAL '5 minutes'
       LIMIT 1`,
      [telegramId],
    );
    if (recentCharge.rows.length > 0) {
      await ctx.editMessageText(TEXTS.PAYMENT_ALREADY_PROCESSING);
      return;
    }

    // Show "processing" state
    await ctx.editMessageText(TEXTS.PAYMENT_PROCESSING_DOTS);

    const orderRef = generateOrderReference(sub.telegram_id, 'retry');
    const tx = await createTransaction({
      telegramId: sub.telegram_id,
      amount: planPrice.amount,
      currency: planPrice.currency,
      method: 'card',
      plan: sub.plan,
      orderReference: orderRef,
    });

    const result = await chargeWithToken({
      orderReference: orderRef,
      amount: planPrice.amount,
      currency: planPrice.currency,
      productName: planPrice.display_name ?? sub.plan,
      recToken: sub.rec_token,
    });

    if (result.success) {
      await updateTransactionStatus(orderRef, 'Approved');
      await updateTransactionCard(orderRef, sub.rec_token, sub.card_pan);

      const subscription = await activateSubscription({
        telegramId: sub.telegram_id,
        plan: sub.plan,
        method: 'card',
        days: planPrice.days,
        transactionId: tx.id,
        prices,
        cardPan: sub.card_pan,
        recToken: sub.rec_token,
      });

      const successText = buildPaymentSuccessMessage({
        plan: sub.plan,
        amount: planPrice.amount,
        currency: planPrice.currency,
        expiresAt: subscription.expires_at,
        isRenewal: true,
      });

      await ctx.editMessageText(successText);

      // Admin notification
      const user = await getUserByTelegramId(sub.telegram_id);
      await sendPaymentNotification(bot, {
        subscriptionId: subscription.id,
        transactionId: tx.id,
        userId: user?.id ?? 0,
        telegramId: sub.telegram_id,
        username: user?.username ?? null,
        plan: sub.plan,
        amount: planPrice.amount,
        currency: planPrice.currency,
        orderReference: orderRef,
        method: 'card',
      });

      // Partner commission
      await processPartnerCommission(bot, {
        referredTelegramId: sub.telegram_id,
        transactionId: tx.id,
        paymentAmount: planPrice.amount,
        paymentCurrency: planPrice.currency,
      });

      logger.info('Retry charge: success', { telegramId: sub.telegram_id, orderRef });
    } else {
      await updateTransactionStatus(orderRef, 'Declined');
      await updateTransactionDeclineReason(orderRef, result.reason ?? null, result.reasonCode ?? null);

      const failedText = buildRetryFailedMessage({
        plan: sub.plan,
        amount: planPrice.amount,
        currency: planPrice.currency,
        cardPan: sub.card_pan,
      });

      await ctx.editMessageText(failedText);

      logger.warn('Retry charge: failed', { telegramId: sub.telegram_id, orderRef, reason: result.reason });
    }
  });

  // Note: BTN_HOME handler is in navigation.ts
}
