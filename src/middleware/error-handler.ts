import { Telegraf } from 'telegraf';
import { logger } from '../utils/logger.js';

/** Register global error handler — catches unhandled errors in all handlers */
export function registerErrorHandler(bot: Telegraf) {
  bot.catch((err, ctx) => {
    logger.error('Unhandled bot error', err, {
      updateType: ctx.updateType,
      userId: ctx.from?.id,
      chatId: ctx.chat?.id,
    });

    // Try to notify the user that something went wrong
    ctx.reply('Виникла помилка. Спробуй ще раз пізніше або звернися в підтримку.')
      .catch(() => {}); // Ignore if reply also fails
  });
}
