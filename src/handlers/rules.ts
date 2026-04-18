import { Telegraf } from 'telegraf';
import { hasAcceptedRules, acceptRules } from '../db/users.js';
import { buildMainMenuKeyboard } from '../keyboards/index.js';
import { TEXTS } from '../texts/index.js';
import { logger } from '../utils/logger.js';
import { generateAndSendInvites } from '../services/invite.js';

const BTN_ACCEPT_RULES = '✅ ПРИЙМАЮ ПРАВИЛА';

const RULES_TEXT =
  '📌 <b>ПРАВИЛА</b>,\n\n' +
  'прочитай уважно,\n' +
  'натисни ✅ ПРИЙМАЮ ПРАВИЛА, щоб отримати доступ до КЛУБУ!\n\n' +
  '😊 Спілкуйтеся на здоров\'я та задоволення,\n' +
  'але пам\'ятайте, у каналі заборонено:\n\n' +
  '— грубе та неповажне спілкування, флуд та спам,\n' +
  '— роздача непроханих порад/просити поради в пості, які не належать до теми,\n' +
  '— писати про свої чи чужі проблеми,\n' +
  '— пряме чи нативне залучення у власні/чужі проекти,\n' +
  '— розсилання повідомлень учасникам,\n' +
  '— організація локальних та інших чатів учасників, клубів, зустрічей,\n' +
  '— риторика, що суперечить благотворній та коректній дискусії для саморозвитку,\n' +
  '— дегенеративний сленг і мат у більшості випадків,\n' +
  '— починати коментар зі слів: "Дмитро...", "чи корисно/шкідливо", "як мені бути", "що робити в моїй ситуації", "як краще мені вчинити" і т.д.\n\n' +
  '📌 Будь-хто може бути видалений з каналу без пояснення причин\n' +
  '(неможливо передбачити всі варіанти неадекватності)\n\n' +
  '<a href="https://docs.google.com/document/d/1Bq-7McGRA1oOxg8MXohzx7IcG4h5EX-S3ekQTCvAFkk/edit?tab=t.0">Ознайомитись з офертою клубу</a>\n\n' +
  '🚀 Залишився 1 крок і ти в каналі\n' +
  'Натисни ✅ ПРИЙМАЮ ПРАВИЛА 👇';

/** Reply keyboard with only the accept rules button */
const RULES_KEYBOARD = {
  keyboard: [
    [{ text: BTN_ACCEPT_RULES }],
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
  } else {
    try {
      await bot.telegram.sendMessage(telegramId, RULES_TEXT, {
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
  bot.hears(BTN_ACCEPT_RULES, async (ctx) => {
    if (!ctx.from) return;

    await acceptRules(ctx.from.id);

    // Restore main menu keyboard
    await ctx.reply(TEXTS.MAIN_MENU, {
      reply_markup: buildMainMenuKeyboard(true),
    });

    await sendInviteLink(bot, ctx.from.id);
  });
}
