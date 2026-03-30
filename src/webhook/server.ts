import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { Telegraf } from 'telegraf';
import { logger } from '../utils/logger.js';
import { buildPaymentPage, generateCallbackSignature, generateResponseSignature } from '../services/wayforpay.js';
import { getTransactionByOrderReference, updateTransactionStatus, updateTransactionCard, claimTransaction } from '../db/transactions.js';
import { activateSubscription } from '../db/subscriptions.js';
import { getPricesForUser, daysFromPlanKey } from '../services/pricing.js';
import { getGlobalPrices, deleteOffersForUser } from '../db/prices.js';
import { sendRulesOrInvite } from '../handlers/rules.js';
import { reloadTexts } from '../texts/index.js';

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

const PAYMENT_LINK_TTL_MS = 15 * 60 * 1000; // 15 minutes

/** Handle GET /pay/:orderReference — render auto-submit form to WayForPay */
async function handlePayPage(orderReference: string, res: ServerResponse): Promise<void> {
  const payment = await getTransactionByOrderReference(orderReference);
  if (!payment) {
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(expiredPage('Платіж не знайдено', 'Цього платежу не існує. Створи новий в боті.'));
    return;
  }

  // Check if link expired (15 minutes)
  const age = Date.now() - new Date(payment.created_at).getTime();
  if (age > PAYMENT_LINK_TTL_MS) {
    await updateTransactionStatus(orderReference, 'Expired');
    res.writeHead(410, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(expiredPage('Посилання протерміноване ⏰', 'Це посилання на оплату діяло 15 хвилин і вже не активне.<br>Поверніться в Telegram бот і створіть нову оплату.'));
    return;
  }

  // Don't allow paying already completed/expired payments
  if (payment.status !== 'Pending') {
    res.writeHead(410, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(expiredPage('Платіж вже оброблено', 'Цей платіж вже було оброблено. Перевір статус у боті.'));
    return;
  }

  // Get product name from global prices
  const globalPrices = await getGlobalPrices();
  const plan = globalPrices[payment.plan];
  const productName = plan?.display_name ?? 'Підписка ME Club';
  const orderDate = Math.floor(new Date(payment.created_at).getTime() / 1000);

  const html = buildPaymentPage({
    orderReference: payment.order_reference,
    orderDate,
    amount: Number(payment.amount),
    currency: payment.currency,
    productName,
  });

  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
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
    // Skip if already processed (WayForPay retries callbacks for 4 days)
    if (payment.status !== 'Pending') {
      logger.info('Callback for already processed payment, skipping', { orderReference, currentStatus: payment.status });
      const time = Math.floor(Date.now() / 1000);
      const responseSignature = generateResponseSignature(orderReference, 'accept', time);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ orderReference, status: 'accept', time, signature: responseSignature }));
      return;
    }

    // Atomically claim — prevents double-processing from WayForPay retries
    const claimed = await claimTransaction(orderReference, 'Pending', transactionStatus);
    if (!claimed) {
      logger.info('Callback race: transaction already claimed, skipping', { orderReference });
      const time = Math.floor(Date.now() / 1000);
      const responseSignature = generateResponseSignature(orderReference, 'accept', time);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ orderReference, status: 'accept', time, signature: responseSignature }));
      return;
    }

    if (transactionStatus === 'Approved') {
      const days = daysFromPlanKey(payment.plan);

      // Save card details on transaction
      await updateTransactionCard(orderReference, recToken, cardPan);

      // Get prices and activate subscription with snapshot
      const prices = await getPricesForUser(payment.telegram_id);
      await activateSubscription({
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

      // Notify user in Telegram
      try {
        const displayName = prices[payment.plan]?.display_name ?? payment.plan;
        await bot.telegram.sendMessage(
          payment.telegram_id,
          `✅ Оплата пройшла успішно!\n\n` +
          `📦 ${displayName}\n` +
          `💰 ${payment.amount} ${payment.currency}\n` +
          `💳 ${cardPan ?? 'Картка'}\n\n` +
          `Дякуємо! Підписка активована 🎉`,
        );
      } catch (err) {
        logger.error('Failed to send payment success message', err);
      }

      // Send rules or invite link
      await sendRulesOrInvite(bot, payment.telegram_id);
    } else if (transactionStatus === 'Declined') {
      // Notify user about failed payment
      const reason = String(data.reason ?? 'Невідома помилка');
      try {
        await bot.telegram.sendMessage(
          payment.telegram_id,
          `❌ Оплату відхилено\n\n` +
          `Причина: ${reason}\n\n` +
          `Спробуй ще раз або обери інший спосіб оплати.`,
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: '🔄 Спробувати ще раз', callback_data: 'subscription' }],
              ],
            },
          },
        );
      } catch (err) {
        logger.error('Failed to send payment declined message', err);
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

      // GET /pay/:orderReference
      if (req.method === 'GET' && segments[0] === 'pay' && segments[1]) {
        await handlePayPage(segments[1], res);
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
