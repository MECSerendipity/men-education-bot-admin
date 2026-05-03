import { Telegraf } from 'telegraf';
import { registerErrorHandler } from './middleware/error-handler.js';
import { registerStartHandler } from './handlers/start.js';
import { registerSubscriptionHandler } from './handlers/subscription.js';
import { registerMySubscriptionHandler } from './handlers/my-subscription.js';
import { registerAccountHandler } from './handlers/account.js';
import { registerSupportHandler } from './handlers/support.js';
import { registerUsdtPaymentHandler } from './handlers/usdt-payment.js';
import { registerUsdtAdminHandler } from './handlers/usdt-admin.js';
import { registerNavigationHandlers } from './handlers/navigation.js';
import { registerPartnerHandler } from './handlers/partner.js';
import { handleJoinRequest } from './services/invite.js';
import { registerRulesHandler, sendRulesOrInvite } from './handlers/rules.js';
import { registerAdminMediaHandler } from './handlers/admin-media.js';
import { hasActiveSubscription } from './db/subscriptions.js';
import { hasAcceptedRules, upsertUser } from './db/users.js';
import { TEXTS } from './texts/index.js';

/** Creates and configures the bot instance with all handlers */
export function createBot(token: string): Telegraf {
  const bot = new Telegraf(token);

  // Global error handler — must be registered first
  registerErrorHandler(bot);

  // Ignore non-private chats (groups, channels) — except join requests and callback queries (admin buttons)
  bot.use(async (ctx, next) => {
    if (ctx.chatJoinRequest) return next();
    if (ctx.callbackQuery) return next();
    if (ctx.chat && ctx.chat.type !== 'private') return;
    return next();
  });

  // Auto-register users — ensure user exists in DB before any handler runs
  const knownUsers = new Set<number>();
  bot.use(async (ctx, next) => {
    if (ctx.from && !knownUsers.has(ctx.from.id)) {
      await upsertUser(ctx.from);
      knownUsers.add(ctx.from.id);
    }
    return next();
  });

  // Rules gate — if user has active subscription but hasn't accepted rules, block everything except rules acceptance
  bot.use(async (ctx, next) => {
    const telegramId = ctx.from?.id;
    if (!telegramId) return next();

    // Allow callback queries (admin buttons in channels) and join requests through
    if (ctx.chatJoinRequest) return next();

    // Check if user typed the accept rules button — let it through
    if (ctx.message && 'text' in ctx.message && ctx.message.text === TEXTS.BTN_ACCEPT_RULES) {
      return next();
    }

    // Check rules gate
    const isSubscribed = await hasActiveSubscription(telegramId);
    if (isSubscribed) {
      const rulesAccepted = await hasAcceptedRules(telegramId);
      if (!rulesAccepted) {
        await sendRulesOrInvite(bot, telegramId);
        return; // Block — don't pass to next handlers
      }
    }

    return next();
  });

  // Register command handlers
  registerStartHandler(bot);

  // Register button handlers
  registerSubscriptionHandler(bot);
  registerMySubscriptionHandler(bot);
  registerAccountHandler(bot);
  registerSupportHandler(bot);
  registerUsdtPaymentHandler(bot);
  registerUsdtAdminHandler(bot);
  registerRulesHandler(bot);
  registerPartnerHandler(bot);

  // Admin media handler (returns file_id for video notes, videos, photos)
  registerAdminMediaHandler(bot);

  // Handle join requests for private channels
  handleJoinRequest(bot);

  // Register navigation (back button, etc.) — must be last
  registerNavigationHandlers(bot);

  return bot;
}
