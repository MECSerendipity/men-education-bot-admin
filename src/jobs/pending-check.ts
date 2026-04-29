import { Telegraf } from 'telegraf';
import { logger } from '../utils/logger.js';
import { checkOrderStatus } from '../services/wayforpay.js';
import { getStalePendingCardTransactions, updateTransactionStatus, updateTransactionCard, updateTransactionDeclineReason, claimTransaction, linkTransactionToSubscription } from '../db/transactions.js';
import { activateSubscription, updateSubscriptionCard, getActiveSubscription, changePaymentMethod, hasActiveSubscription } from '../db/subscriptions.js';
import { logSubscriptionEvent } from '../db/subscription-events.js';
import { getPricesForUser, daysFromPlanKey, switchPlanMethod } from '../services/pricing.js';
import { deleteOffersForUser } from '../db/prices.js';
import { sendRulesOrInvite } from '../handlers/rules.js';
import { sendPaymentNotification, buildPaymentSuccessMessage, buildFirstPaymentDeclinedMessage } from '../services/notifications.js';
import { getUserByTelegramId } from '../db/users.js';
import { refreshMenuKeyboard } from '../keyboards/index.js';
import { processPartnerCommission } from '../services/partner.js';
import { TEXTS } from '../texts/index.js';
import { notifyJobResult } from '../services/job-monitor.js';

/**
 * Check stale Pending card transactions via WayForPay CHECK_STATUS API.
 * - Approved -> activate subscription, notify user
 * - Declined -> notify user
 * - Not found / Expired / no status -> mark as Cancelled
 */
export async function runPendingCheckJob(bot: Telegraf): Promise<void> {
  const pending = await getStalePendingCardTransactions();
  if (pending.length === 0) {
    await notifyJobResult(bot, { jobName: 'Pending Transactions Check', found: 0, success: 0, failed: 0 });
    return;
  }

  logger.info(`Pending check: found ${pending.length} stale transaction(s)`);

  let approvedCount = 0;
  let declinedCount = 0;
  let cancelledCount = 0;
  let processingCount = 0;
  let errorCount = 0;

  for (const tx of pending) {
    try {
      const result = await checkOrderStatus(tx.order_reference);
      const { transactionStatus, recToken, cardPan } = result;

      logger.info('Pending check: WayForPay status', {
        orderReference: tx.order_reference,
        transactionStatus,
        reasonCode: result.reasonCode,
      });

      if (transactionStatus === 'Approved') {
        const claimed = await claimTransaction(tx.order_reference, tx.status, 'Approved');
        if (!claimed) {
          logger.info('Pending check: already claimed, skipping', { orderReference: tx.order_reference });
          continue;
        }

        await processApproved(bot, tx, recToken, cardPan);
        approvedCount++;
      } else if (transactionStatus === 'Declined' || transactionStatus === 'Refunded') {
        const claimed = await claimTransaction(tx.order_reference, tx.status, 'Declined');
        if (!claimed) continue;

        await updateTransactionDeclineReason(tx.order_reference, result.reason, result.reasonCode);
        await processDeclined(bot, tx);
        declinedCount++;
      } else if (transactionStatus === 'InProcessing' || transactionStatus === 'WaitingAuthComplete') {
        logger.info('Pending check: still processing, will retry', { orderReference: tx.order_reference });
        processingCount++;
      } else {
        await updateTransactionStatus(tx.order_reference, 'Cancelled');
        logger.info('Pending check: cancelled stale transaction', {
          orderReference: tx.order_reference,
          wayforpayStatus: transactionStatus || 'empty',
        });
        cancelledCount++;
      }
    } catch (err) {
      errorCount++;
      logger.error('Pending check: failed to process transaction', { orderReference: tx.order_reference, err });
    }
  }

  await notifyJobResult(bot, {
    jobName: 'Pending Transactions Check',
    found: pending.length,
    success: approvedCount + declinedCount + cancelledCount,
    failed: errorCount,
    details: `Approved: ${approvedCount}, Declined: ${declinedCount}, Cancelled: ${cancelledCount}` +
      (processingCount > 0 ? `, InProcessing: ${processingCount}` : ''),
  });
}

async function processApproved(bot: Telegraf, tx: { id: number; telegram_id: number; plan: string; amount: number; currency: string; order_reference: string; status: string }, recToken: string | null, cardPan: string | null): Promise<void> {
  if (tx.plan === 'card_change') {
    const activeSub = await getActiveSubscription(tx.telegram_id);
    if (recToken && activeSub) {
      await updateTransactionCard(tx.order_reference, recToken, cardPan);
      await updateSubscriptionCard(tx.telegram_id, recToken, cardPan);
      await linkTransactionToSubscription(tx.id, activeSub.id);
      await logSubscriptionEvent({
        subscriptionId: activeSub.id, telegramId: tx.telegram_id, event: 'card_changed',
        plan: activeSub.plan, method: 'card', cardPan, amount: 1, currency: 'UAH', expiresAt: activeSub.expires_at,
      });
      await bot.telegram.sendMessage(tx.telegram_id, TEXTS.CARD_CHANGED_SUCCESS.replace('{cardPan}', cardPan ?? TEXTS.CARD_PAN_SAVED)).catch(() => {});
    }
  } else if (tx.plan === 'method_change') {
    const activeSub = await getActiveSubscription(tx.telegram_id);
    if (recToken && activeSub) {
      await updateTransactionCard(tx.order_reference, recToken, cardPan);
      const newPlan = switchPlanMethod(activeSub.plan, 'card');
      await changePaymentMethod(tx.telegram_id, 'card', newPlan, cardPan);
      await updateSubscriptionCard(tx.telegram_id, recToken, cardPan);
      await linkTransactionToSubscription(tx.id, activeSub.id);
      await bot.telegram.sendMessage(tx.telegram_id, TEXTS.METHOD_CHANGED_TO_CARD.replace('{cardPan}', cardPan ?? TEXTS.CARD_PAN_SAVED)).catch(() => {});
    }
  } else {
    // Normal subscription payment
    const days = daysFromPlanKey(tx.plan);
    const isRenewal = await hasActiveSubscription(tx.telegram_id);

    await updateTransactionCard(tx.order_reference, recToken, cardPan);

    const prices = await getPricesForUser(tx.telegram_id);
    const subscription = await activateSubscription({
      telegramId: tx.telegram_id, plan: tx.plan, method: 'card', days,
      transactionId: tx.id, prices, cardPan, recToken,
    });

    await deleteOffersForUser(tx.telegram_id);

    const successText = buildPaymentSuccessMessage({
      plan: tx.plan, amount: tx.amount, currency: tx.currency,
      expiresAt: subscription.expires_at, isRenewal,
    });

    await bot.telegram.sendMessage(tx.telegram_id, successText, { parse_mode: 'HTML' }).catch(() => {});

    if (!isRenewal) {
      await sendRulesOrInvite(bot, tx.telegram_id);
    } else {
      await refreshMenuKeyboard(bot, tx.telegram_id, true);
    }

    const user = await getUserByTelegramId(tx.telegram_id);
    await sendPaymentNotification(bot, {
      subscriptionId: subscription.id, transactionId: tx.id, userId: user?.id ?? 0,
      telegramId: tx.telegram_id, username: user?.username ?? null,
      plan: tx.plan, amount: tx.amount, currency: tx.currency,
      orderReference: tx.order_reference, method: 'card',
    });

    await processPartnerCommission(bot, {
      referredTelegramId: tx.telegram_id, transactionId: tx.id,
      paymentAmount: tx.amount, paymentCurrency: tx.currency,
    });
  }

  logger.info('Pending check: processed Approved transaction', { orderReference: tx.order_reference, plan: tx.plan });
}

async function processDeclined(bot: Telegraf, tx: { telegram_id: number; plan: string; amount: number; currency: string }): Promise<void> {
  if (tx.plan === 'card_change') {
    await bot.telegram.sendMessage(tx.telegram_id, TEXTS.CARD_ADD_FAILED.replace('{reason}', '')).catch(() => {});
  } else if (tx.plan === 'method_change') {
    await bot.telegram.sendMessage(tx.telegram_id, TEXTS.METHOD_CHANGE_DECLINED.replace('{reason}', '')).catch(() => {});
  } else {
    const declinedText = buildFirstPaymentDeclinedMessage({ plan: tx.plan, amount: tx.amount, currency: tx.currency });
    await bot.telegram.sendMessage(tx.telegram_id, declinedText, {
      reply_markup: { inline_keyboard: [[{ text: TEXTS.BTN_RETRY, callback_data: 'subscription' }]] },
    }).catch(() => {});
  }

  logger.info('Pending check: processed Declined transaction', { orderReference: (tx as any).order_reference, plan: tx.plan });
}
