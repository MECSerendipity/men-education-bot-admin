import { Telegraf, type Context } from 'telegraf';
import { db } from '../db/index.js';
import { logger } from '../utils/logger.js';

/** Log an incoming or outgoing activity to the database */
async function logActivity(
  telegramId: number,
  username: string | undefined,
  direction: 'in' | 'out',
  messageType: string,
  content: string | null,
  handler?: string,
): Promise<void> {
  try {
    await db.query(
      `INSERT INTO activity_logs (telegram_id, username, direction, message_type, content, handler)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [telegramId, username ?? null, direction, messageType, content, handler ?? null],
    );
  } catch (err) {
    logger.error('Failed to write activity log', err);
  }
}

/** Log outgoing bot message */
export async function logBotReply(
  telegramId: number,
  content: string,
  handler?: string,
): Promise<void> {
  await logActivity(telegramId, undefined, 'out', 'message', content, handler);
}

/** Register activity logging middleware — captures all incoming user actions */
export function registerActivityLogger(bot: Telegraf): void {
  bot.use(async (ctx: Context, next) => {
    const from = ctx.from;
    if (!from) return next();

    const telegramId = from.id;
    const username = from.username;

    // Log incoming message
    if (ctx.message) {
      const msg = ctx.message;
      if ('text' in msg) {
        await logActivity(telegramId, username, 'in', 'text', msg.text);
      } else if ('photo' in msg) {
        await logActivity(telegramId, username, 'in', 'photo', msg.caption ?? null);
      } else if ('document' in msg) {
        await logActivity(telegramId, username, 'in', 'document', msg.caption ?? null);
      } else if ('sticker' in msg) {
        await logActivity(telegramId, username, 'in', 'sticker', msg.sticker.emoji ?? null);
      } else {
        await logActivity(telegramId, username, 'in', 'other', null);
      }
    }

    // Log callback query (button press)
    if (ctx.callbackQuery && 'data' in ctx.callbackQuery) {
      await logActivity(telegramId, username, 'in', 'callback', ctx.callbackQuery.data);
    }

    return next();
  });
}
