import { Telegraf } from 'telegraf';
import { BACK_KEYBOARD } from '../keyboards/index.js';
import { TEXTS } from '../texts/index.js';

/** Register "Підтримка" button handler — links to @MEdopomoga */
export function registerSupportHandler(bot: Telegraf) {
  bot.hears(TEXTS.BTN_SUPPORT, async (ctx) => {
    await ctx.reply(TEXTS.SUPPORT, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '📩 Написати в підтримку', url: 'https://t.me/MEdopomoga' }],
        ],
      },
    });
  });
}
