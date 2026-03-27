import { Telegraf } from 'telegraf';
import { TEXTS } from '../texts/index.js';
import { hasActiveSubscription } from '../db/users.js';

/** Register "Моя підписка" button handler — checks subscription status */
export function registerMySubscriptionHandler(bot: Telegraf) {
  bot.hears(TEXTS.BTN_MY_SUBSCRIPTION, async (ctx) => {
    const isActive = await hasActiveSubscription(ctx.from.id);

    if (!isActive) {
      await ctx.reply(TEXTS.NO_SUBSCRIPTION, {
        reply_markup: {
          inline_keyboard: [
            [{ text: TEXTS.BTN_SUBSCRIPTION, callback_data: 'subscription' }],
          ],
        },
      });
    } else {
      // TODO: show subscription details
      await ctx.reply('✅ У тебе активна підписка!');
    }
  });
}
