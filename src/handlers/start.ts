import { Telegraf } from 'telegraf';
import { MAIN_MENU_KEYBOARD } from '../keyboards/index.js';
import { TEXTS } from '../texts/index.js';
import { upsertUser } from '../db/users.js';

/** Register /start command — shows main menu */
export function registerStartHandler(bot: Telegraf) {
  bot.start(async (ctx) => {
    // Save/update user in database
    await upsertUser(ctx.from);
    await ctx.reply(TEXTS.MAIN_MENU, {
      reply_markup: MAIN_MENU_KEYBOARD,
    });
    await ctx.reply(TEXTS.ABOUT, {
      reply_markup: {
        inline_keyboard: [
          [{ text: TEXTS.BTN_SUBSCRIPTION_INLINE, callback_data: 'subscription' }],
        ],
      },
    });
  });
}
