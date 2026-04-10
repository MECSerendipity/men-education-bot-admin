import { Telegraf } from 'telegraf';
import { TEXTS } from '../texts/index.js';
import {
  getActiveSubscription,
  getCancelledSubscription,
  cancelSubscription,
  reactivateSubscription,
  type Subscription,
} from '../db/subscriptions.js';
import { formatDate, planDisplayName } from '../services/notifications.js';
import { logger } from '../utils/logger.js';

/** Extract subscription display info */
function subInfo(sub: Subscription) {
  const startedDate = formatDate(new Date(sub.started_at));
  const expiresDate = formatDate(new Date(sub.expires_at));
  const plan = planDisplayName(sub.plan);
  const method = sub.method === 'card' ? '\u{1F4B3} Картка' : '\u{26A1} USDT';
  const prices = sub.prices as Record<string, { amount?: number; currency?: string }> | null;
  const planPrice = prices?.[sub.plan];
  const priceText = planPrice ? `${planPrice.amount} ${planPrice.currency}` : '-';
  return { startedDate, expiresDate, plan, method, priceText };
}

/** Build text for active subscription */
function buildActiveText(sub: Subscription): string {
  const { startedDate, expiresDate, plan, method, priceText } = subInfo(sub);
  return (
    `Твоя підписка активна \u{1F680}\n\n` +
    `\u{1F4C5} Дата приєднання: ${startedDate}\n` +
    `\u{1F449} План: ${plan}\n` +
    `\u{1F4B0} Сума: ${priceText}\n` +
    `\u{1F4B3} Метод оплати: ${method}\n\n` +
    `\u{1F5D3}\u{FE0F} Дата наступного платежу: ${expiresDate}\n\n` +
    `\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\n\n` +
    `\u{203C}\u{FE0F} Ти можеш скасувати підписку в будь-який час. При цьому гроші за підписку не повертаються, але всі доступи до контенту і каналів залишаться в тебе до закінчення оплаченого періоду\n\n` +
    `\u{203C}\u{FE0F} Ти отримуватимеш нагадування про закінчення періоду підписки\n\n` +
    `\u{203C}\u{FE0F} Якщо не оплатиш підписку на новий обраний період або не скасуєш її, то в день закінчення вона автоматично буде продовжена на такий самий період, який був (тільки для гривневої підписки)`
  );
}

/** Build text for cancelled subscription */
function buildCancelledText(sub: Subscription): string {
  const { startedDate, expiresDate, plan, method, priceText } = subInfo(sub);
  return (
    `\u{26A0}\u{FE0F} Твоя підписка скасована\n\n` +
    `\u{1F4C5} Дата приєднання: ${startedDate}\n` +
    `\u{1F449} План: ${plan}\n` +
    `\u{1F4B0} Сума: ${priceText}\n` +
    `\u{1F4B3} Метод оплати: ${method}\n\n` +
    `\u{1F5D3}\u{FE0F} Доступ дійсний до: ${expiresDate}\n\n` +
    `\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\n\n` +
    `Ти все ще маєш доступ до контенту і каналів до ${expiresDate}.\n\n` +
    `\u{1F4A1} Якщо передумаєш — можеш відновити підписку зі збереженням поточної ціни до кінця оплаченого періоду.`
  );
}

/** Keyboards */
const ACTIVE_KEYBOARD = {
  inline_keyboard: [
    [{ text: '\u{1F4DD} Змінити тариф', callback_data: 'sub:change_plan' }],
    [{ text: '\u{1F4B3} Змінити карту', callback_data: 'sub:change_card' }],
    [{ text: '\u{274C} Скасувати підписку', callback_data: 'sub:cancel' }],
  ],
};

const CANCELLED_KEYBOARD = {
  inline_keyboard: [
    [{ text: '\u{2705} Відновити підписку', callback_data: 'sub:reactivate' }],
  ],
};

const CANCEL_CONFIRM_KEYBOARD = {
  inline_keyboard: [
    [{ text: '\u{274C} Так, скасувати', callback_data: 'sub:cancel_confirm' }],
    [{ text: '\u{2B05}\u{FE0F} Ні, повернутись', callback_data: 'sub:back' }],
  ],
};

/** Register "Моя підписка" button handler */
export function registerMySubscriptionHandler(bot: Telegraf) {
  bot.hears(TEXTS.BTN_MY_SUBSCRIPTION, async (ctx) => {
    const activeSub = await getActiveSubscription(ctx.from.id);
    if (activeSub) {
      await ctx.reply(buildActiveText(activeSub), { reply_markup: ACTIVE_KEYBOARD });
      return;
    }

    const cancelledSub = await getCancelledSubscription(ctx.from.id);
    if (cancelledSub) {
      await ctx.reply(buildCancelledText(cancelledSub), { reply_markup: CANCELLED_KEYBOARD });
      return;
    }

    await ctx.reply(TEXTS.NO_SUBSCRIPTION, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '\u{1F4CB} Оформити підписку', callback_data: 'subscription' }],
        ],
      },
    });
  });

  // Change plan — stub
  bot.action('sub:change_plan', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.editMessageText(
      '\u{1F4DD} Зміна тарифу\n\n' +
      '\u{1F6A7} Ця функція ще в розробці. Скоро буде доступна!',
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '\u{2B05}\u{FE0F} Назад', callback_data: 'sub:back' }],
          ],
        },
      },
    );
  });

  // Change card — stub
  bot.action('sub:change_card', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.editMessageText(
      '\u{1F4B3} Зміна картки\n\n' +
      '\u{1F6A7} Ця функція ще в розробці. Скоро буде доступна!',
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '\u{2B05}\u{FE0F} Назад', callback_data: 'sub:back' }],
          ],
        },
      },
    );
  });

  // Cancel subscription — show confirmation
  bot.action('sub:cancel', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.editMessageText(
      '\u{26A0}\u{FE0F} Ти впевнений, що хочеш скасувати підписку?\n\n' +
      'Доступ до контенту і каналів залишиться до кінця оплаченого періоду.\n' +
      'Гроші за підписку не повертаються.\n\n' +
      'Ти зможеш відновити підписку в будь-який момент до закінчення терміну.',
      { reply_markup: CANCEL_CONFIRM_KEYBOARD },
    );
  });

  // Cancel subscription — confirmed
  bot.action('sub:cancel_confirm', async (ctx) => {
    await ctx.answerCbQuery();
    const sub = await cancelSubscription(ctx.from!.id);
    if (!sub) {
      await ctx.editMessageText('Підписку не знайдено або вона вже скасована.');
      return;
    }

    logger.info('Subscription cancelled by user', { telegramId: ctx.from!.id, subscriptionId: sub.id });

    await ctx.editMessageText(buildCancelledText(sub), { reply_markup: CANCELLED_KEYBOARD });
  });

  // Reactivate cancelled subscription
  bot.action('sub:reactivate', async (ctx) => {
    await ctx.answerCbQuery();
    const sub = await reactivateSubscription(ctx.from!.id);
    if (!sub) {
      await ctx.editMessageText('Підписку не знайдено або термін вже закінчився.');
      return;
    }

    logger.info('Subscription reactivated by user', { telegramId: ctx.from!.id, subscriptionId: sub.id });

    await ctx.editMessageText(
      `\u{2705} Підписку відновлено!\n\n` +
      `Раді, що ти з нами \u{1F4AA}\n\n` +
      `Твоя підписка активна \u{1F680}`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '\u{1F4CB} Перевірити підписку', callback_data: 'sub:back' }],
          ],
        },
      },
    );
  });

  // Back to subscription info
  bot.action('sub:back', async (ctx) => {
    await ctx.answerCbQuery();
    const telegramId = ctx.from!.id;

    const activeSub = await getActiveSubscription(telegramId);
    if (activeSub) {
      await ctx.editMessageText(buildActiveText(activeSub), { reply_markup: ACTIVE_KEYBOARD });
      return;
    }

    const cancelledSub = await getCancelledSubscription(telegramId);
    if (cancelledSub) {
      await ctx.editMessageText(buildCancelledText(cancelledSub), { reply_markup: CANCELLED_KEYBOARD });
      return;
    }

    await ctx.editMessageText(TEXTS.NO_SUBSCRIPTION, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '\u{1F4CB} Оформити підписку', callback_data: 'subscription' }],
        ],
      },
    });
  });
}
