import { Telegraf } from 'telegraf';
import { TEXTS } from '../texts/index.js';

/** Register "Меню Партнера" button handler — stub */
export function registerPartnerHandler(bot: Telegraf) {
  bot.hears(TEXTS.BTN_PARTNER, async (ctx) => {
    await ctx.reply(
      '\u{1F91D} Меню Партнера\n\n' +
      '\u{1F6A7} Ця функція ще в розробці. Скоро буде доступна!',
    );
  });
}
