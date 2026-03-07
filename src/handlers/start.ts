import { Telegraf } from 'telegraf';
import { MAIN_MENU_KEYBOARD } from '../keyboards/index.js';
import { TEXTS } from '../texts/index.js';

/** Register /start command — shows main menu */
export function registerStartHandler(bot: Telegraf) {
  bot.start((ctx) => {
    ctx.reply(TEXTS.MAIN_MENU, {
      reply_markup: MAIN_MENU_KEYBOARD,
    });
  });
}
