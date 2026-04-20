import { Telegraf } from 'telegraf';
import { db } from '../db/index.js';
import { chargeWithToken } from '../services/wayforpay.js';
import { createTransaction, updateTransactionStatus, updateTransactionCard, updateTransactionDeclineReason } from '../db/transactions.js';
import { activateSubscription, type Subscription } from '../db/subscriptions.js';
import { logger } from '../utils/logger.js';
import { sendPaymentNotification, buildPaymentSuccessMessage, buildChargeFailedMessage } from '../services/notifications.js';
import { getUserByTelegramId } from '../db/users.js';
import { processPartnerCommission } from '../services/partner.js';
import { generateOrderReference } from '../utils/order-reference.js';

/**
 * TODO: TESTING MODE — runs every 1 min via scheduler.
 * Remove or convert to production schedule before deploying.
 */

interface PlanPrice {
  key: string;
  amount: number;
  currency: string;
  days: number;
  display_name?: string;
}

/** Find Active card subscriptions expiring within 1 day with recToken */
async function getCardSubscriptionsExpiringSoon(): Promise<Subscription[]> {
  const result = await db.query(
    `SELECT * FROM subscriptions
     WHERE status = 'Active'
       AND method = 'card'
       AND rec_token IS NOT NULL
       AND prices IS NOT NULL
       AND expires_at < NOW() + INTERVAL '1 day'
       AND expires_at > NOW()`,
  );
  return result.rows;
}

function getPlanPrice(sub: Subscription): PlanPrice | null {
  const prices = sub.prices as Record<string, PlanPrice> | null;
  if (!prices) return null;
  const plan = prices[sub.plan];
  if (!plan?.amount || !plan?.currency || !plan?.days) return null;
  return plan;
}

/** Test card charge job — runs every minute, charges expiring card subscriptions */
export async function runTestCardCharge(bot: Telegraf): Promise<void> {
  const subs = await getCardSubscriptionsExpiringSoon();

  if (subs.length === 0) return;

  for (const sub of subs) {
    const planPrice = getPlanPrice(sub);
    if (!planPrice) continue;

    const orderRef = generateOrderReference(sub.telegram_id, 'renew');

    logger.info('Test card charge: charging', {
      telegramId: sub.telegram_id,
      plan: sub.plan,
      amount: planPrice.amount,
      orderRef,
    });

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

      logger.info('Test card charge: success', { telegramId: sub.telegram_id, orderRef });

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
        logger.error('Test card charge: failed to notify user', err);
      }

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

      await processPartnerCommission(bot, {
        referredTelegramId: sub.telegram_id,
        transactionId: tx.id,
        paymentAmount: planPrice.amount,
        paymentCurrency: planPrice.currency,
      });
    } else {
      await updateTransactionStatus(orderRef, 'Declined');
      await updateTransactionDeclineReason(orderRef, result.reason ?? null, result.reasonCode ?? null);

      logger.warn('Test card charge: failed', {
        telegramId: sub.telegram_id,
        orderRef,
        reason: result.reason,
      });

      try {
        const failedText = buildChargeFailedMessage({
          plan: sub.plan,
          amount: planPrice.amount,
          currency: planPrice.currency,
          cardPan: sub.card_pan,
        });

        const buttonText = sub.card_pan
          ? `\u{1F4B3} Оплатити зараз (${sub.card_pan})`
          : '\u{1F4B3} Оплатити зараз';

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
        logger.error('Test card charge: failed to notify user', err);
      }
    }
  }
}
