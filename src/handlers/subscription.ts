import { Telegraf } from 'telegraf';
import { PAYMENT_KEYBOARD, CARD_TARIFF_KEYBOARD, USDT_TARIFF_KEYBOARD, MAIN_MENU_KEYBOARD } from '../keyboards/index.js';
import { TEXTS } from '../texts/index.js';

/** Register "Тарифні плани" button handler */
export function registerSubscriptionHandler(bot: Telegraf) {
  // Tariff plans — show payment method selection (text button)
  bot.hears(TEXTS.BTN_SUBSCRIPTION, async (ctx) => {
    await ctx.reply('Обери спосіб оплати 👇', {
      reply_markup: PAYMENT_KEYBOARD,
    });
  });

  // Tariff plans — show payment method selection (inline callback from /start or "Моя підписка")
  bot.action('subscription', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply('Обери спосіб оплати 👇', {
      reply_markup: PAYMENT_KEYBOARD,
    });
  });

  // Card payment — show prices + tariff keyboard
  bot.hears(TEXTS.BTN_PAY_CARD, async (ctx) => {
    await ctx.reply(TEXTS.PAY_CARD, {
      reply_markup: CARD_TARIFF_KEYBOARD,
    });
  });

  // USDT payment — show prices + tariff keyboard
  bot.hears(TEXTS.BTN_PAY_USDT, async (ctx) => {
    await ctx.reply(TEXTS.PAY_USDT, {
      reply_markup: USDT_TARIFF_KEYBOARD,
    });
  });

  // Change payment method — back to payment selection
  bot.hears(TEXTS.BTN_CHANGE_PAYMENT, async (ctx) => {
    await ctx.reply('Обери спосіб оплати 👇', {
      reply_markup: PAYMENT_KEYBOARD,
    });
  });

  // Back to main menu
  bot.hears(TEXTS.BTN_HOME, async (ctx) => {
    await ctx.reply(TEXTS.MAIN_MENU, {
      reply_markup: MAIN_MENU_KEYBOARD,
    });
  });
}
