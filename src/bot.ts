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
import { registerRulesHandler } from './handlers/rules.js';

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

  // Handle join requests for private channels
  handleJoinRequest(bot);

  // Register navigation (back button, etc.) — must be last
  registerNavigationHandlers(bot);

  return bot;
}
