import { Telegraf } from 'telegraf';
import { db } from '../db/index.js';
import { chargeWithToken } from '../services/wayforpay.js';
import { createTransaction, updateTransactionStatus, updateTransactionCard, updateTransactionDeclineReason } from '../db/transactions.js';
import { activateSubscription, type Subscription } from '../db/subscriptions.js';
import { logger } from '../utils/logger.js';
import { sendPaymentNotification, buildPaymentSuccessMessage, buildChargeFailedMessage } from '../services/notifications.js';
import { getUserByTelegramId } from '../db/users.js';
import { TEXTS } from '../texts/index.js';
import { processPartnerCommission } from '../services/partner.js';

interface PlanPrice {
  key: string;
  amount: number;
  currency: string;
  days: number;
  display_name?: string;
}

/** Find Active subscriptions expiring within 0-2 days (by calendar date) with recToken */
async function getCardSubscriptionsDueForRenewal(): Promise<Subscription[]> {
  const result = await db.query(
    `SELECT * FROM subscriptions
     WHERE status = 'Active'
       AND method = 'card'
       AND rec_token IS NOT NULL
       AND prices IS NOT NULL
       AND expires_at::date - CURRENT_DATE BETWEEN 0 AND 2`,
  );
  return result.rows;
}

/** Find Active crypto subscriptions expiring within 0-2 days */
async function getCryptoSubscriptionsDueForRenewal(): Promise<Subscription[]> {
  const result = await db.query(
    `SELECT * FROM subscriptions
     WHERE status = 'Active'
       AND method = 'crypto'
       AND prices IS NOT NULL
       AND expires_at::date - CURRENT_DATE BETWEEN 0 AND 2`,
  );
  return result.rows;
}

/** Extract plan price from subscription prices snapshot */
function getPlanPrice(sub: Subscription): PlanPrice | null {
  const prices = sub.prices as Record<string, PlanPrice> | null;
  if (!prices) return null;
  const plan = prices[sub.plan];
  if (!plan?.amount || !plan?.currency || !plan?.days) return null;
  return plan;
}

/** Charge card subscriptions that are due for renewal */
export async function runCardChargeJob(bot: Telegraf): Promise<void> {
  const subs = await getCardSubscriptionsDueForRenewal();

  if (subs.length === 0) return;

  logger.info(`Charge job: found ${subs.length} card subscription(s) due for renewal`);

  for (const sub of subs) {
    const planPrice = getPlanPrice(sub);
    if (!planPrice) {
      logger.error('Charge job: CRITICAL — missing price for plan', {
        subscriptionId: sub.id,
        telegramId: sub.telegram_id,
        plan: sub.plan,
      });
      try {
        await bot.telegram.sendMessage(
          sub.telegram_id,
          TEXTS.AUTO_RENEWAL_PLAN_ERROR,
        );
      } catch { /* ignore send failure */ }
      continue;
    }

    const orderRef = `ME_RENEW_${sub.telegram_id}_${Date.now()}`;
    const productName = planPrice.display_name ?? sub.plan;

    logger.info('Charge job: charging', {
      telegramId: sub.telegram_id,
      plan: sub.plan,
      amount: planPrice.amount,
      currency: planPrice.currency,
      orderRef,
    });

    // Create transaction record
    const tx = await createTransaction({
      telegramId: sub.telegram_id,
      amount: planPrice.amount,
      currency: planPrice.currency,
      method: 'card',
      plan: sub.plan,
      orderReference: orderRef,
    });

    // Charge via recToken
    const result = await chargeWithToken({
      orderReference: orderRef,
      amount: planPrice.amount,
      currency: planPrice.currency,
      productName,
      recToken: sub.rec_token!,
    });

    if (result.success) {
      await updateTransactionStatus(orderRef, 'Approved');
      await updateTransactionCard(orderRef, sub.rec_token, sub.card_pan);

      const prices = sub.prices as Record<string, PlanPrice>;
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

      logger.info('Charge job: success', { telegramId: sub.telegram_id, orderRef });

      try {
        const successText = buildPaymentSuccessMessage({
          plan: sub.plan,
          amount: planPrice.amount,
          currency: planPrice.currency,
          expiresAt: subscription.expires_at,
          isRenewal: true,
        });
        await bot.telegram.sendMessage(sub.telegram_id, successText);
      } catch (err) {
        logger.error('Charge job: failed to notify user', err);
      }

      // Send card payment notification to admin channel
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

      // Process partner commission for auto-renewal
      await processPartnerCommission(bot, {
        referredTelegramId: sub.telegram_id,
        transactionId: tx.id,
        paymentAmount: planPrice.amount,
        paymentCurrency: planPrice.currency,
      });
    } else {
      await updateTransactionStatus(orderRef, 'Declined');
      await updateTransactionDeclineReason(orderRef, result.reason ?? null, result.reasonCode ?? null);

      logger.warn('Charge job: charge failed', {
        telegramId: sub.telegram_id,
        orderRef,
        reason: result.reason,
        reasonCode: result.reasonCode,
      });

      try {
        const failedText = buildChargeFailedMessage({
          plan: sub.plan,
          amount: planPrice.amount,
          currency: planPrice.currency,
          cardPan: sub.card_pan,
        });

        const buttonText = sub.card_pan
          ? `${TEXTS.BTN_PAY_NOW} (${sub.card_pan})`
          : TEXTS.BTN_PAY_NOW;

        await bot.telegram.sendMessage(
          sub.telegram_id,
          failedText,
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: buttonText, callback_data: `retry_charge:${sub.id}` }],
              ],
            },
          },
        );
      } catch (err) {
        logger.error('Charge job: failed to notify user about failure', err);
      }
    }
  }
}

/** Send renewal reminders to crypto subscriptions that are due */
export async function runCryptoReminderJob(bot: Telegraf): Promise<void> {
  const subs = await getCryptoSubscriptionsDueForRenewal();

  if (subs.length === 0) return;

  logger.info(`Charge job: found ${subs.length} crypto subscription(s) due for renewal`);

  for (const sub of subs) {
    const planPrice = getPlanPrice(sub);
    if (!planPrice) {
      logger.warn('Charge job: no price found for crypto plan', { telegramId: sub.telegram_id, plan: sub.plan });
      continue;
    }

    const daysLeft = Math.max(0, Math.ceil((sub.expires_at.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
    const urgency = daysLeft === 0
      ? 'Сьогодні останній день підписки!'
      : `До кінця підписки: ${daysLeft} дн.`;

    logger.info('Charge job: sending crypto reminder', {
      telegramId: sub.telegram_id,
      plan: sub.plan,
      daysLeft,
    });

    try {
      // TODO: replace with full crypto payment flow (hash submission + admin approval)
      await bot.telegram.sendMessage(
        sub.telegram_id,
        `\u{1F514} Нагадування про продовження підписки\n\n` +
        `\u{1F4E6} ${planPrice.display_name ?? sub.plan}\n` +
        `\u{1F4B0} ${planPrice.amount} ${planPrice.currency}\n` +
        `${urgency}\n\n` +
        `Оплатіть, щоб зберегти доступ до клубу.`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: TEXTS.BTN_PAY_USDT_INLINE, callback_data: 'subscription' }],
            ],
          },
        },
      );
    } catch (err) {
      logger.error('Charge job: failed to send crypto reminder', err);
    }
  }
}
