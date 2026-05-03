import { Telegraf } from 'telegraf';
import { hasAcceptedRules, acceptRules } from '../db/users.js';
import { buildMainMenuKeyboard } from '../keyboards/index.js';
import { TEXTS } from '../texts/index.js';
import { logger } from '../utils/logger.js';
import { generateAndSendInvites } from '../services/invite.js';
import { refreshMenuKeyboard } from '../keyboards/index.js';


/** Reply keyboard with only the accept rules button */
const RULES_KEYBOARD = {
  keyboard: [
    [{ text: TEXTS.BTN_ACCEPT_RULES }],
  ],
  resize_keyboard: true,
};

/**
 * Send rules message or invite link depending on whether user already accepted rules.
 * Called after successful payment (both card and USDT).
 */
export async function sendRulesOrInvite(bot: Telegraf, telegramId: number): Promise<void> {
  const alreadyAccepted = await hasAcceptedRules(telegramId);

  if (alreadyAccepted) {
    await sendInviteLink(bot, telegramId);
    await refreshMenuKeyboard(bot, telegramId, true);
  } else {
    try {
      await bot.telegram.sendMessage(telegramId, TEXTS.RULES_TEXT, {
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
        reply_markup: RULES_KEYBOARD,
      });
    } catch (err) {
      logger.error('Failed to send rules message', err);
    }
  }
}

/** Generate and send invite links to private channels */
async function sendInviteLink(bot: Telegraf, telegramId: number): Promise<void> {
  await generateAndSendInvites(bot, telegramId);
}

/** Register rules acceptance handler */
export function registerRulesHandler(bot: Telegraf) {
  bot.hears(TEXTS.BTN_ACCEPT_RULES, async (ctx) => {
    if (!ctx.from) return;

    await acceptRules(ctx.from.id);

    // Restore main menu keyboard
    await ctx.reply(TEXTS.MAIN_MENU, {
      reply_markup: buildMainMenuKeyboard(true),
    });

    await sendInviteLink(bot, ctx.from.id);
  });
}
