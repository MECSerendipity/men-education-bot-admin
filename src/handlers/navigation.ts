import { Telegraf } from 'telegraf';
import { MAIN_MENU_KEYBOARD } from '../keyboards/index.js';
import { TEXTS } from '../texts/index.js';

/** Register navigation handlers (back button, home, etc.) */
export function registerNavigationHandlers(bot: Telegraf) {
  bot.hears(TEXTS.BTN_BACK, async (ctx) => {
    await ctx.reply(TEXTS.MAIN_MENU, {
      reply_markup: MAIN_MENU_KEYBOARD,
    });
  });

  bot.hears(TEXTS.BTN_HOME, async (ctx) => {
    await ctx.reply(TEXTS.MAIN_MENU, {
      reply_markup: MAIN_MENU_KEYBOARD,
    });
  });
}
