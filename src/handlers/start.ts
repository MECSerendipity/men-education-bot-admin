import { Telegraf } from 'telegraf';
import { MAIN_MENU_KEYBOARD } from '../keyboards/index.js';
import { TEXTS } from '../texts/index.js';
import { upsertUser, hasAcceptedRules } from '../db/users.js';
import { hasActiveSubscription } from '../db/subscriptions.js';
import { sendRulesOrInvite } from './rules.js';

/** Register /start command — shows main menu */
export function registerStartHandler(bot: Telegraf) {
  bot.start(async (ctx) => {
    // Save/update user in database
    await upsertUser(ctx.from);

    const telegramId = ctx.from.id;
    const isSubscribed = await hasActiveSubscription(telegramId);
    const rulesAccepted = await hasAcceptedRules(telegramId);

    // If user has active subscription but hasn't accepted rules — show rules
    if (isSubscribed && !rulesAccepted) {
      await sendRulesOrInvite(bot, telegramId);
      return;
    }

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
