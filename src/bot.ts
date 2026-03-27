import { Telegraf } from 'telegraf';
import { registerStartHandler } from './handlers/start.js';
import { registerSubscriptionHandler } from './handlers/subscription.js';
import { registerMySubscriptionHandler } from './handlers/my-subscription.js';
import { registerAccountHandler } from './handlers/account.js';
import { registerSupportHandler } from './handlers/support.js';
import { registerNavigationHandlers } from './handlers/navigation.js';

/** Creates and configures the bot instance with all handlers */
export function createBot(token: string): Telegraf {
  const bot = new Telegraf(token);

  // Register command handlers
  registerStartHandler(bot);

  // Register button handlers
  registerSubscriptionHandler(bot);
  registerMySubscriptionHandler(bot);
  registerAccountHandler(bot);
  registerSupportHandler(bot);

  // Register navigation (back button, etc.) — must be last
  registerNavigationHandlers(bot);

  return bot;
}
