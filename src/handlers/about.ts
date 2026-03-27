import { Telegraf } from 'telegraf';
import { BACK_KEYBOARD } from '../keyboards/index.js';
import { TEXTS } from '../texts/index.js';

/** @deprecated UNUSED — Register "Про канал" button handler — shows channel description */
export function registerAboutHandler(bot: Telegraf) {
  bot.hears(TEXTS.BTN_ABOUT, (ctx) => {
    ctx.reply(TEXTS.ABOUT, {
      reply_markup: BACK_KEYBOARD,
    });
  });
}
