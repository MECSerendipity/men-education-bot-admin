import { Telegraf } from 'telegraf';
import { TEXTS } from '../texts/index.js';
import { SUPPORT_URL } from '../config.js';

/** Register "Підтримка" button handler — links to @MEdopomoga */
export function registerSupportHandler(bot: Telegraf) {
  bot.hears(TEXTS.BTN_SUPPORT, async (ctx) => {
    await ctx.reply(TEXTS.SUPPORT, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '📩 Написати в підтримку', url: SUPPORT_URL }],
        ],
      },
    });
  });
}
