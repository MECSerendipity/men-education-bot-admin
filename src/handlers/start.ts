import { Telegraf } from 'telegraf';
import { buildMainMenuKeyboard } from '../keyboards/index.js';
import { TEXTS } from '../texts/index.js';
import { upsertUser, hasAcceptedRules, getUserByTelegramId } from '../db/users.js';
import { hasActiveSubscription } from '../db/subscriptions.js';
import { sendRulesOrInvite } from './rules.js';
import { findReferrerByCode, createReferral } from '../db/partners.js';
import { logger } from '../utils/logger.js';

/** Register /start command — shows main menu, handles deep link referrals */
export function registerStartHandler(bot: Telegraf) {
  bot.start(async (ctx) => {
    const telegramId = ctx.from.id;
    const payload = ctx.startPayload; // deep link parameter after ?start=

    // Check if user already exists BEFORE upserting
    const existingUser = await getUserByTelegramId(telegramId);
    const isNewUser = !existingUser;

    // Save/update user in database
    await upsertUser(ctx.from);

    // Process referral deep link only for new users
    if (isNewUser && payload) {
      const referrerId = await findReferrerByCode(payload);
      if (referrerId && referrerId !== telegramId) {
        const referral = await createReferral(referrerId, telegramId);
        if (referral) {
          logger.info('Referral click recorded', { referrerId, referredId: telegramId, refCode: payload });
        }
      }
    }

    const isSubscribed = await hasActiveSubscription(telegramId);
    const rulesAccepted = await hasAcceptedRules(telegramId);

    // If user has active subscription but hasn't accepted rules — show rules
    if (isSubscribed && !rulesAccepted) {
      await sendRulesOrInvite(bot, telegramId);
      return;
    }

    await ctx.reply(TEXTS.ABOUT, {
      reply_markup: {
        inline_keyboard: [
          [{ text: TEXTS.BTN_SUBSCRIPTION_INLINE, callback_data: 'subscription' }],
        ],
      },
    });

    await ctx.reply(TEXTS.MAIN_MENU, {
      reply_markup: buildMainMenuKeyboard(isSubscribed),
    });
  });
}
