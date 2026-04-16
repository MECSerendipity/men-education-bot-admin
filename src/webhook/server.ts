import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { Telegraf } from 'telegraf';
import { logger } from '../utils/logger.js';
import { generateCallbackSignature, generateResponseSignature } from '../services/wayforpay.js';
import { getTransactionByOrderReference, updateTransactionStatus, updateTransactionCard, updateTransactionDeclineReason, claimTransaction, linkTransactionToSubscription } from '../db/transactions.js';
import { activateSubscription, updateSubscriptionCard, getActiveSubscription, changePaymentMethod } from '../db/subscriptions.js';
import { logSubscriptionEvent } from '../db/subscription-events.js';
import { getPricesForUser, daysFromPlanKey, switchPlanMethod } from '../services/pricing.js';
import { deleteOffersForUser } from '../db/prices.js';
import { sendRulesOrInvite } from '../handlers/rules.js';
import { reloadTexts } from '../texts/index.js';
import { sendPaymentNotification, buildPaymentSuccessMessage } from '../services/notifications.js';
import { getUserByTelegramId } from '../db/users.js';
import { getPaymentMessage, deletePaymentMessage } from '../utils/payment-messages.js';

const MAX_BODY_SIZE = 64 * 1024; // 64 KB — more than enough for WayForPay callbacks

/** Read full request body as string (rejects if body exceeds size limit) */
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalSize = 0;
    req.on('data', (chunk: Buffer) => {
      totalSize += chunk.length;
      if (totalSize > MAX_BODY_SIZE) {
        req.destroy();
        reject(new Error('Request body too large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

/** Parse URL path segments */
function parsePath(url: string): string[] {
  return new URL(url, 'http://localhost').pathname.split('/').filter(Boolean);
}


/** Render a styled info/error page */
function expiredPage(title: string, message: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#f5f5f5;text-align:center;}h1{margin-bottom:12px;}</style>
</head><body>
<div>
  <h1>${title}</h1>
  <p>${message}</p>
</div>
</body></html>`;
}

/** Handle GET/POST /pay/success — show result page after payment */
async function handleSuccessPage(req: IncomingMessage, res: ServerResponse): Promise<void> {
  // WayForPay POSTs form data with payment result to returnUrl
  let orderRef = '';
  if (req.method === 'POST') {
    const body = await readBody(req);
    // WayForPay sends form-encoded data; extract orderReference
    const params = new URLSearchParams(body);
    orderRef = params.get('orderReference') ?? '';
  }

  // Check actual payment status if we have an order reference
  let isApproved = false;
  if (orderRef) {
    const payment = await getTransactionByOrderReference(orderRef);
    isApproved = payment?.status === 'Approved';
  }

  const title = isApproved ? '✅ Дякуємо за оплату!' : '⏳ Оплата обробляється';
  const message = isApproved
    ? 'Повернись у Telegram бот — підписка вже активна.'
    : 'Перевір статус оплати у Telegram боті.';

  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Оплата</title>
<style>body{font-family:sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#f5f5f5;text-align:center;}</style>
</head><body>
<div>
  <h1>${title}</h1>
  <p>${message}</p>
</div>
</body></html>`);
}

/** Send confirmation to user — try editing original message, fallback to new message */
async function sendConfirmation(
  bot: Telegraf,
  telegramId: number,
  orderReference: string,
  text: string,
  replyMarkup?: { inline_keyboard: { text: string; callback_data: string }[][] },
): Promise<void> {
  try {
    const savedMsg = getPaymentMessage(orderReference);
    if (savedMsg) {
      await bot.telegram.editMessageText(savedMsg.chatId, savedMsg.messageId, undefined, text, { reply_markup: replyMarkup });
      deletePaymentMessage(orderReference);
      return;
    }
  } catch {
    // Edit failed (message deleted, too old, etc.) — fallback to new message
    deletePaymentMessage(orderReference);
  }
  try {
    await bot.telegram.sendMessage(telegramId, text, { reply_markup: replyMarkup });
  } catch (err) {
    logger.error('Failed to send confirmation message', { telegramId, orderReference, err });
  }
}

/** Handle POST /api/wayforpay/callback — process WayForPay payment result */
async function handleCallback(req: IncomingMessage, res: ServerResponse, bot: Telegraf): Promise<void> {
  const body = await readBody(req);
  let data: Record<string, unknown>;

  try {
    data = JSON.parse(body);
  } catch {
    res.writeHead(400);
    res.end('Invalid JSON');
    return;
  }

  logger.info('WayForPay callback received', {
    orderReference: data.orderReference,
    status: data.transactionStatus,
    reasonCode: data.reasonCode,
    reason: data.reason,
    amount: data.amount,
    cardPan: data.cardPan,
    recToken: data.recToken ? 'present' : 'absent',
  });

  // Verify signature
  const expectedSignature = generateCallbackSignature({
    merchantAccount: String(data.merchantAccount ?? ''),
    orderReference: String(data.orderReference ?? ''),
    amount: String(data.amount ?? ''),
    currency: String(data.currency ?? ''),
    authCode: String(data.authCode ?? ''),
    cardPan: String(data.cardPan ?? ''),
    transactionStatus: String(data.transactionStatus ?? ''),
    reasonCode: String(data.reasonCode ?? ''),
  });

  if (data.merchantSignature !== expectedSignature) {
    logger.warn('WayForPay callback signature mismatch', {
      expected: expectedSignature,
      received: data.merchantSignature,
    });
    // Still respond to WayForPay to stop retries
  }

  const orderReference = String(data.orderReference ?? '');
  const transactionStatus = String(data.transactionStatus ?? '');
  const recToken = data.recToken ? String(data.recToken) : null;
  const cardPan = data.cardPan ? String(data.cardPan) : null;

  // Find payment in DB
  const payment = await getTransactionByOrderReference(orderReference);

  if (payment) {
    // Skip if already fully processed (Approved/Declined are final)
    if (payment.status === 'Approved' || payment.status === 'Declined') {
      logger.info('Callback for already processed payment, skipping', { orderReference, currentStatus: payment.status });
      const time = Math.floor(Date.now() / 1000);
      const responseSignature = generateResponseSignature(orderReference, 'accept', time);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ orderReference, status: 'accept', time, signature: responseSignature }));
      return;
    }

    // WaitingAuthComplete is intermediate (3DS) — update status but don't process yet
    if (transactionStatus === 'WaitingAuthComplete') {
      await updateTransactionStatus(orderReference, 'WaitingAuthComplete');
      logger.info('3DS in progress, waiting for final callback', { orderReference });
      const time = Math.floor(Date.now() / 1000);
      const responseSignature = generateResponseSignature(orderReference, 'accept', time);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ orderReference, status: 'accept', time, signature: responseSignature }));
      return;
    }

    // Atomically claim — prevents double-processing from WayForPay retries
    const claimed = await claimTransaction(orderReference, payment.status, transactionStatus);
    if (!claimed) {
      logger.info('Callback race: transaction already claimed, skipping', { orderReference });
      const time = Math.floor(Date.now() / 1000);
      const responseSignature = generateResponseSignature(orderReference, 'accept', time);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ orderReference, status: 'accept', time, signature: responseSignature }));
      return;
    }

    if (transactionStatus === 'Approved' && payment.plan === 'card_change') {
      // Card change flow — update recToken on subscription, no new subscription created
      const activeSub = await getActiveSubscription(payment.telegram_id);

      let confirmText: string;
      if (recToken && activeSub) {
        await updateTransactionCard(orderReference, recToken, cardPan);
        const updated = await updateSubscriptionCard(payment.telegram_id, recToken, cardPan);
        await linkTransactionToSubscription(payment.id, activeSub.id);

        if (updated) {
          await logSubscriptionEvent({
            subscriptionId: activeSub.id,
            telegramId: payment.telegram_id,
            event: 'card_changed',
            plan: activeSub.plan,
            method: 'card',
            cardPan,
            amount: 1,
            currency: 'UAH',
            expiresAt: activeSub.expires_at,
          });
          logger.info('Card changed successfully', { telegramId: payment.telegram_id, cardPan });
          confirmText = `\u{2705} Картку змінено!\n\nНова картка: ${cardPan ?? 'збережено'}\nНаступне автоматичне продовження буде з нової картки.`;
        } else {
          logger.warn('Card change: updateSubscriptionCard returned false', { orderReference });
          confirmText = '\u{26A0}\u{FE0F} Не вдалося зберегти нову картку. Спробуй ще раз або зверніся в підтримку.';
        }
      } else {
        await updateTransactionCard(orderReference, recToken, cardPan);
        logger.warn('Card change approved but no recToken or no active subscription', { orderReference, hasRecToken: !!recToken, hasActiveSub: !!activeSub });
        confirmText = '\u{26A0}\u{FE0F} Не вдалося зберегти нову картку. Спробуй ще раз або зверніся в підтримку.';
      }

      const confirmKeyboard = { inline_keyboard: [[{ text: '\u{1F4CB} Моя підписка', callback_data: 'sub:back' }]] };
      await sendConfirmation(bot, payment.telegram_id, orderReference, confirmText, confirmKeyboard);
    } else if (transactionStatus === 'Approved' && payment.plan === 'method_change') {
      // Method change flow (crypto → card): update method + plan + save recToken
      const activeSub = await getActiveSubscription(payment.telegram_id);

      let confirmText: string;
      if (recToken && activeSub) {
        await updateTransactionCard(orderReference, recToken, cardPan);
        const newPlan = switchPlanMethod(activeSub.plan, 'card');
        await changePaymentMethod(payment.telegram_id, 'card', newPlan, cardPan);
        await updateSubscriptionCard(payment.telegram_id, recToken, cardPan);
        await linkTransactionToSubscription(payment.id, activeSub.id);

        logger.info('Payment method changed to card', { telegramId: payment.telegram_id, cardPan, newPlan });
        confirmText = `\u{2705} Метод оплати змінено на картку!\n\nКартка: ${cardPan ?? 'збережено'}\nНаступне продовження буде автоматично з картки.`;
      } else {
        await updateTransactionCard(orderReference, recToken, cardPan);
        logger.warn('Method change approved but no recToken or no active subscription', { orderReference, hasRecToken: !!recToken, hasActiveSub: !!activeSub });
        confirmText = '\u{26A0}\u{FE0F} Не вдалося змінити метод оплати. Спробуй ще раз або зверніся в підтримку.';
      }

      const confirmKeyboard = { inline_keyboard: [[{ text: '\u{1F4CB} Моя підписка', callback_data: 'sub:back' }]] };
      await sendConfirmation(bot, payment.telegram_id, orderReference, confirmText, confirmKeyboard);
    } else if (transactionStatus === 'Approved') {
      const days = daysFromPlanKey(payment.plan);

      // Save card details on transaction
      await updateTransactionCard(orderReference, recToken, cardPan);

      // Get prices and activate subscription with snapshot
      const prices = await getPricesForUser(payment.telegram_id);
      const subscription = await activateSubscription({
        telegramId: payment.telegram_id,
        plan: payment.plan,
        method: 'card',
        days,
        transactionId: payment.id,
        prices,
        cardPan,
        recToken,
      });

      // Delete price offers after successful payment
      await deleteOffersForUser(payment.telegram_id);

      // Notify user in Telegram — edit original payment message or send new one
      const successText = buildPaymentSuccessMessage({
        plan: payment.plan,
        amount: payment.amount,
        currency: payment.currency,
        expiresAt: subscription.expires_at,
      });

      await sendConfirmation(bot, payment.telegram_id, orderReference, successText);

      // Send rules or invite link
      await sendRulesOrInvite(bot, payment.telegram_id);

      // Send card payment notification to admin channel
      const user = await getUserByTelegramId(payment.telegram_id);
      await sendPaymentNotification(bot, {
        subscriptionId: subscription.id,
        transactionId: payment.id,
        userId: user?.id ?? 0,
        telegramId: payment.telegram_id,
        username: user?.username ?? null,
        plan: payment.plan,
        amount: payment.amount,
        currency: payment.currency,
        orderReference,
        method: 'card',
      });
    } else if (transactionStatus === 'Declined') {
      await updateTransactionDeclineReason(orderReference, String(data.reason ?? ''), String(data.reasonCode ?? ''));
      // Don't notify user if transaction was already cancelled (e.g. invoice removed)
      if (payment.status === 'Cancelled') {
        logger.info('Declined callback for cancelled transaction, skipping notification', { orderReference });
      } else if (payment.plan === 'card_change') {
        const reason = String(data.reason ?? 'Невідома помилка');
        const declineText = `\u{274C} Не вдалося додати картку\n\nПричина: ${reason}\n\nСпробуй ще раз.`;
        const keyboard = { inline_keyboard: [[{ text: '\u{1F4CB} Моя підписка', callback_data: 'sub:back' }]] };
        await sendConfirmation(bot, payment.telegram_id, orderReference, declineText, keyboard);
      } else if (payment.plan === 'method_change') {
        const reason = String(data.reason ?? 'Невідома помилка');
        const declineText = `\u{274C} Не вдалося змінити метод оплати\n\nПричина: ${reason}\n\nСпробуй ще раз.`;
        const keyboard = { inline_keyboard: [[{ text: '\u{1F4CB} Моя підписка', callback_data: 'sub:back' }]] };
        await sendConfirmation(bot, payment.telegram_id, orderReference, declineText, keyboard);
      } else {
        const reason = String(data.reason ?? 'Невідома помилка');
        try {
          await bot.telegram.sendMessage(
            payment.telegram_id,
            `\u{274C} Оплату відхилено\n\n` +
            `Причина: ${reason}\n\n` +
            `Спробуй ще раз або обери інший спосіб оплати.`,
            {
              reply_markup: {
                inline_keyboard: [
                  [{ text: '\u{1F504} Спробувати ще раз', callback_data: 'subscription' }],
                ],
              },
            },
          );
        } catch (err) {
          logger.error('Failed to send payment declined message', err);
        }
      }
    }
  } else {
    logger.warn('Payment not found for callback', { orderReference });
  }

  // Respond to WayForPay (required to stop callback retries)
  const time = Math.floor(Date.now() / 1000);
  const responseSignature = generateResponseSignature(orderReference, 'accept', time);
  const responseBody = JSON.stringify({
    orderReference,
    status: 'accept',
    time,
    signature: responseSignature,
  });

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(responseBody);
}

/** Start the webhook HTTP server */
export function startWebhookServer(bot: Telegraf): void {
  const port = Number(process.env.WEBHOOK_PORT ?? 3001);

  const server = createServer(async (req, res) => {
    try {
      const segments = parsePath(req.url ?? '/');

      // GET or POST /pay/success (WayForPay redirects with POST)
      if ((req.method === 'GET' || req.method === 'POST') && segments[0] === 'pay' && segments[1] === 'success') {
        await handleSuccessPage(req, res);
        return;
      }

      // POST /api/wayforpay/callback
      if (req.method === 'POST' && segments[0] === 'api' && segments[1] === 'wayforpay' && segments[2] === 'callback') {
        await handleCallback(req, res, bot);
        return;
      }

      // POST /internal/reload-texts — called by admin panel to apply text changes
      if (req.method === 'POST' && segments[0] === 'internal' && segments[1] === 'reload-texts') {
        try {
          reloadTexts();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
        } catch {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Failed to reload texts' }));
        }
        return;
      }

      res.writeHead(404);
      res.end('Not found');
    } catch (err) {
      logger.error('Webhook server error', err);
      res.writeHead(500);
      res.end('Internal error');
    }
  });

  server.listen(port, () => {
    logger.info(`Webhook server started on port ${port}`);
  });
}
