import { Telegraf } from 'telegraf';
import { buildMainMenuKeyboard } from '../keyboards/index.js';
import { TEXTS } from '../texts/index.js';
import { hasActiveSubscription } from '../db/subscriptions.js';

/** Register navigation handlers (back button, home, etc.) */
export function registerNavigationHandlers(bot: Telegraf) {
  bot.hears(TEXTS.BTN_BACK, async (ctx) => {
    const isSubscribed = await hasActiveSubscription(ctx.from.id);
    await ctx.reply(TEXTS.MAIN_MENU, {
      reply_markup: buildMainMenuKeyboard(isSubscribed),
    });
  });

  bot.hears(TEXTS.BTN_HOME, async (ctx) => {
    const isSubscribed = await hasActiveSubscription(ctx.from.id);
    await ctx.reply(TEXTS.MAIN_MENU, {
      reply_markup: buildMainMenuKeyboard(isSubscribed),
    });
  });

  // Fallback — catch any unhandled message (groups already filtered by middleware)
  bot.on('message', async (ctx) => {
    const isSubscribed = await hasActiveSubscription(ctx.from.id);
    await ctx.reply('\u{1F9E0} Мій мозок це не обробляє. Скористайся меню \u{1F447}', {
      reply_markup: buildMainMenuKeyboard(isSubscribed),
    });
  });
}
