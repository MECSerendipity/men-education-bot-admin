import { Telegraf } from 'telegraf';
import { isFirstApprovedTransaction } from '../db/transactions.js';
import { escapeHtml } from '../utils/html.js';
import { logger } from '../utils/logger.js';
import { USDT, CARD } from '../config.js';

/** Format date as DD.MM.YYYY */
export function formatDate(date: Date): string {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  return `${d}.${m}.${y}`;
}

/** Map plan key to human-readable duration */
export function planDisplayName(plan: string): string {
  if (plan.includes('1m')) return '1 month';
  if (plan.includes('6m')) return '6 months';
  if (plan.includes('12m')) return '12 months';
  return plan;
}

/** Build payment success message for user (shared across card, USDT, auto-renewal) */
export function buildPaymentSuccessMessage(params: {
  plan: string;
  amount: number;
  currency: string;
  expiresAt: Date;
  isRenewal?: boolean;
}): string {
  const statusText = params.isRenewal
    ? 'Підписка продовжена! Дякую \u{1F4AA}'
    : 'Підписка активована! Дякую \u{1F4AA}';

  return (
    `\u{2705} Оплата підтверджена\n\n` +
    `▸ План: ${planDisplayName(params.plan)}\n` +
    `▸ Сума: ${params.amount} ${params.currency}\n` +
    `\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\n` +
    `${statusText}\n\n` +
    `\u{1F5D3}\u{FE0F} Дата наступного платежу: ${formatDate(params.expiresAt)}\n` +
    `▸ Сума: ${params.amount} ${params.currency}\n\n` +
    `З повагою, Men Education Team!`
  );
}

/** Build declined message for first payment (WayForPay callback) */
export function buildFirstPaymentDeclinedMessage(params: {
  plan: string;
  amount: number;
  currency: string;
}): string {
  return (
    `\u{274C} Оплата не підтверджена\n\n` +
    `▸ План: ${planDisplayName(params.plan)}\n` +
    `▸ Сума: ${params.amount} ${params.currency}\n` +
    `\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\n` +
    `Спробуй ще раз або обери інший спосіб оплати.`
  );
}

/** Build declined message for auto-renewal (charge job) */
export function buildChargeFailedMessage(params: {
  plan: string;
  amount: number;
  currency: string;
  cardPan: string | null;
}): string {
  return (
    `\u{274C} Не вдалося автоматично продовжити підписку\n\n` +
    `▸ План: ${planDisplayName(params.plan)}\n` +
    `▸ Сума: ${params.amount} ${params.currency}\n` +
    (params.cardPan ? `▸ Картка: ${params.cardPan}\n` : '') +
    `\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\n` +
    `Перевір картку і спробуй оплатити ще раз \u{1F447}`
  );
}

/** Build declined message for manual retry (after pressing "Оплатити зараз") */
export function buildRetryFailedMessage(params: {
  plan: string;
  amount: number;
  currency: string;
  cardPan: string | null;
}): string {
  return (
    `\u{274C} Оплата не підтверджена\n\n` +
    `▸ План: ${planDisplayName(params.plan)}\n` +
    `▸ Сума: ${params.amount} ${params.currency}\n` +
    (params.cardPan ? `▸ Картка: ${params.cardPan}\n` : '') +
    `\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\n` +
    `Виріши проблему, а я завтра спробую знову.`
  );
}

/** Send payment notification to admin channel (card + auto-renewal) */
export async function sendPaymentNotification(bot: Telegraf, params: {
  subscriptionId: number;
  transactionId: number;
  userId: number;
  telegramId: number;
  username: string | null;
  plan: string;
  amount: number;
  currency: string;
  orderReference: string;
  method: 'card' | 'crypto';
}): Promise<void> {
  if (!USDT.adminChannelId) {
    logger.warn('USDT_ADMIN_CHANNEL_ID not configured, skipping payment notification');
    return;
  }

  const threadEnv = params.method === 'card' ? CARD.adminThreadId : USDT.adminThreadId;
  const threadId = Number(threadEnv) || undefined;

  const isFirst = await isFirstApprovedTransaction(params.telegramId, params.orderReference);
  const usernameDisplay = params.username ? `@${escapeHtml(params.username)}` : 'немає';
  const tag = isFirst ? '#first_subscription' : '#renew';
  const currencyLabel = params.method === 'card' ? 'UAH' : 'USDT';

  const message =
    `<b>ME ${currencyLabel} - оплата:</b>\n\n` +
    `▸ User ID: <code>${params.userId}</code>\n` +
    `▸ Username: ${usernameDisplay}\n` +
    `▸ Subscription ID: <code>${params.subscriptionId}</code>\n` +
    `▸ Transaction ID: <code>${params.transactionId}</code>\n` +
    `▸ Plan: ${planDisplayName(params.plan)}\n` +
    `▸ Amount: ${params.amount} ${escapeHtml(params.currency)}\n` +
    `▸ Status: \u{2705} Approved\n\n` +
    tag;

  try {
    await bot.telegram.sendMessage(USDT.adminChannelId, message, {
      parse_mode: 'HTML',
      message_thread_id: threadId,
    });
  } catch (err) {
    logger.error('Failed to send payment notification to admin channel', err);
  }
}
