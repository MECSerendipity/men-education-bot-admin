import { Telegraf } from 'telegraf';
import { registerStartHandler } from './handlers/start.js';
import { registerAboutHandler } from './handlers/about.js';
import { registerNavigationHandlers } from './handlers/navigation.js';

/** Creates and configures the bot instance with all handlers */
export function createBot(token: string): Telegraf {
  const bot = new Telegraf(token);

  // Register command handlers
  registerStartHandler(bot);

  // Register button handlers
  registerAboutHandler(bot);

  // Register navigation (back button, etc.) — must be last
  registerNavigationHandlers(bot);

  return bot;
}
