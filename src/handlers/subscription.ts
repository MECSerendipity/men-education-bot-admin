import { Telegraf, type Context } from 'telegraf';
import { PAYMENT_KEYBOARD, CARD_TARIFF_KEYBOARD, USDT_TARIFF_KEYBOARD, MAIN_MENU_KEYBOARD } from '../keyboards/index.js';
import { TEXTS } from '../texts/index.js';
import { PLANS } from '../services/wayforpay.js';
import { createPayment } from '../db/payments.js';
import { logger } from '../utils/logger.js';

/** Map button text to plan key */
const BUTTON_TO_PLAN: Record<string, string> = {
  [TEXTS.BTN_CARD_1M]: 'card_1m',
  [TEXTS.BTN_CARD_6M]: 'card_6m',
  [TEXTS.BTN_CARD_12M]: 'card_12m',
};

/** Generate unique order reference */
function generateOrderReference(telegramId: number): string {
  return `ME_${telegramId}_${Date.now()}`;
}

/** Handle card tariff button click — create payment and send payment link */
async function handleCardTariffClick(ctx: Context, planKey: string): Promise<void> {
  const plan = PLANS[planKey];
  if (!plan || !ctx.from) return;

  const telegramId = ctx.from.id;
  const orderReference = generateOrderReference(telegramId);
  const webhookBaseUrl = process.env.WEBHOOK_BASE_URL;

  if (!webhookBaseUrl) {
    logger.error('WEBHOOK_BASE_URL not configured');
    await ctx.reply('⚠️ Оплата тимчасово недоступна. Спробуй пізніше.');
    return;
  }

  try {
    await createPayment({
      telegramId,
      amount: plan.amount,
      currency: plan.currency,
      method: 'card',
      plan: planKey,
      orderReference,
    });

    const paymentUrl = `${webhookBaseUrl}/pay/${orderReference}`;

    await ctx.reply(
      `💳 Оплата: ${plan.label}\n💰 Сума: ${plan.amount} ${plan.currency}\n\nНатисни кнопку нижче для оплати 👇`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '💳 Оплатити', url: paymentUrl }],
          ],
        },
      },
    );
  } catch (err) {
    logger.error('Failed to create payment', err);
    await ctx.reply('⚠️ Помилка створення платежу. Спробуй ще раз.');
  }
}

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

  // Card tariff buttons — create payment and send link
  bot.hears(TEXTS.BTN_CARD_1M, async (ctx) => {
    await handleCardTariffClick(ctx, BUTTON_TO_PLAN[TEXTS.BTN_CARD_1M]);
  });

  bot.hears(TEXTS.BTN_CARD_6M, async (ctx) => {
    await handleCardTariffClick(ctx, BUTTON_TO_PLAN[TEXTS.BTN_CARD_6M]);
  });

  bot.hears(TEXTS.BTN_CARD_12M, async (ctx) => {
    await handleCardTariffClick(ctx, BUTTON_TO_PLAN[TEXTS.BTN_CARD_12M]);
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
