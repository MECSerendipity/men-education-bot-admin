import { Telegraf } from 'telegraf';
import { TEXTS } from '../texts/index.js';
import {
  getActiveSubscription,
  getCancelledSubscription,
  cancelSubscription,
  reactivateSubscription,
  changePaymentMethod,
  changeSubscriptionPlan,
  type Subscription,
} from '../db/subscriptions.js';
import { formatDate, planDisplayName } from '../services/notifications.js';
import { logger } from '../utils/logger.js';
import { getInviteButtons } from '../services/invite.js';
import { createInvoice, removeInvoice } from '../services/wayforpay.js';
import { createTransaction, hasPendingCardTransaction, updateTransactionStatus } from '../db/transactions.js';
import { switchPlanMethod, planDuration } from '../services/pricing.js';
import { savePaymentMessage, deletePaymentMessage } from '../utils/payment-messages.js';
import { generateOrderReference } from '../utils/order-reference.js';

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
    [{ text: '\u{1F517} Мої посилання в клуб', callback_data: 'sub:my_links' }],
    [{ text: '\u{1F4DD} Змінити план', callback_data: 'sub:change_plan' }],
    [{ text: '\u{1F504} Змінити метод оплати', callback_data: 'sub:change_method' }],
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

  // My club links
  bot.action('sub:my_links', async (ctx) => {
    await ctx.answerCbQuery();
    const telegramId = ctx.from!.id;

    const activeSub = await getActiveSubscription(telegramId);
    if (!activeSub) return;

    const linkButtons = await getInviteButtons(bot, telegramId);

    await ctx.editMessageReplyMarkup({
      inline_keyboard: [
        ...linkButtons,
        [{ text: '\u{2B05}\u{FE0F} Назад', callback_data: 'sub:back' }],
      ],
    });
  });

  // Change payment method
  bot.action('sub:change_method', async (ctx) => {
    await ctx.answerCbQuery();
    const telegramId = ctx.from!.id;

    const activeSub = await getActiveSubscription(telegramId);
    if (!activeSub) return;

    const currentMethod = activeSub.method === 'card' ? '\u{1F4B3} Картка' : '\u{26A1} USDT';
    const targetMethod = activeSub.method === 'card' ? '\u{26A1} USDT' : '\u{1F4B3} Картка';
    const targetKey = activeSub.method === 'card' ? 'crypto' : 'card';

    if (targetKey === 'crypto') {
      // card → crypto: instant switch
      await ctx.editMessageText(
        `\u{1F504} Зміна методу оплати\n\n` +
        `Поточний метод: ${currentMethod}\n` +
        `Новий метод: ${targetMethod}\n\n` +
        `При зміні на USDT автоматичне продовження карткою буде вимкнено. ` +
        `Перед закінченням підписки ти отримаєш нагадування оплатити вручну.`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '\u{26A1} Змінити на USDT', callback_data: 'sub:switch_to_crypto' }],
              [{ text: '\u{2B05}\u{FE0F} Назад', callback_data: 'sub:back' }],
            ],
          },
        },
      );
    } else {
      // crypto → card: needs 1 UAH verification
      await ctx.editMessageText(
        `\u{1F504} Зміна методу оплати\n\n` +
        `Поточний метод: ${currentMethod}\n` +
        `Новий метод: ${targetMethod}\n\n` +
        `Для підключення оплати карткою потрібно додати картку. ` +
        `Буде списано 1 грн (обмеження платіжної системи).\n\n` +
        `Після цього підписка буде автоматично продовжуватись з картки.`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '\u{1F4B3} Додати картку', callback_data: 'sub:switch_to_card' }],
              [{ text: '\u{2B05}\u{FE0F} Назад', callback_data: 'sub:back' }],
            ],
          },
        },
      );
    }
  });

  // Switch to crypto — instant
  bot.action('sub:switch_to_crypto', async (ctx) => {
    await ctx.answerCbQuery();
    const telegramId = ctx.from!.id;

    const activeSub = await getActiveSubscription(telegramId);
    if (!activeSub) return;

    const newPlan = switchPlanMethod(activeSub.plan, 'crypto');
    const sub = await changePaymentMethod(telegramId, 'crypto', newPlan);

    if (!sub) {
      await ctx.editMessageText('Не вдалося змінити метод оплати. Спробуй ще раз.');
      return;
    }

    logger.info('Payment method changed to crypto', { telegramId, oldPlan: activeSub.plan, newPlan });

    await ctx.editMessageText(
      `\u{2705} Метод оплати змінено на USDT!\n\n` +
      `Автоматичне продовження карткою вимкнено.\n` +
      `Перед закінченням підписки ти отримаєш нагадування оплатити USDT.`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '\u{1F4CB} Моя підписка', callback_data: 'sub:back' }],
          ],
        },
      },
    );
  });

  // Switch to card — 1 UAH invoice to get recToken
  bot.action('sub:switch_to_card', async (ctx) => {
    await ctx.answerCbQuery();
    const telegramId = ctx.from!.id;

    if (await hasPendingCardTransaction(telegramId)) {
      await ctx.editMessageText(
        'У тебе вже є активний платіж. Скористайся попереднім посиланням або зачекай 10 хвилин.',
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '\u{2B05}\u{FE0F} Назад', callback_data: 'sub:back' }],
            ],
          },
        },
      );
      return;
    }

    const orderReference = generateOrderReference(telegramId, 'methodchange');

    await createTransaction({
      telegramId,
      amount: 1,
      currency: 'UAH',
      method: 'card',
      plan: 'method_change',
      orderReference,
    });

    const result = await createInvoice({
      orderReference,
      amount: 1,
      currency: 'UAH',
      productName: 'Зміна методу оплати ME Club',
      clientAccountId: `uid:${telegramId}`,
    });

    if (!result.success || !result.invoiceUrl) {
      logger.error('Failed to create method change invoice', { orderReference, reason: result.reason });
      await ctx.editMessageText(
        '\u{26A0}\u{FE0F} Зміна методу тимчасово недоступна. Спробуй пізніше.',
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '\u{2B05}\u{FE0F} Назад', callback_data: 'sub:back' }],
            ],
          },
        },
      );
      return;
    }

    const msg = await ctx.editMessageText(
      '\u{1F4B3} Додавання картки\n\n' +
      'Натисни кнопку нижче та введи дані картки.\n' +
      'Вартість: 1 грн (обмеження платіжної системи).\n\n' +
      '\u{23F3} Посилання дійсне 10 хвилин',
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '\u{1F4B3} Додати картку', url: result.invoiceUrl }],
            [{ text: '\u{274C} Скасувати', callback_data: `cancel_method_change:${orderReference}` }],
          ],
        },
      },
    );

    if (msg && typeof msg === 'object' && 'message_id' in msg) {
      savePaymentMessage(orderReference, ctx.chat!.id, msg.message_id);
    }
  });

  // Cancel method change — remove invoice and cancel transaction
  bot.action(/^cancel_method_change:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const orderReference = ctx.match[1];

    await removeInvoice(orderReference);
    await updateTransactionStatus(orderReference, 'Cancelled');
    deletePaymentMessage(orderReference);

    const telegramId = ctx.from!.id;
    const activeSub = await getActiveSubscription(telegramId);
    if (activeSub) {
      await ctx.editMessageText(buildActiveText(activeSub), { reply_markup: ACTIVE_KEYBOARD });
    } else {
      const cancelledSub = await getCancelledSubscription(telegramId);
      if (cancelledSub) {
        await ctx.editMessageText(buildCancelledText(cancelledSub), { reply_markup: CANCELLED_KEYBOARD });
      } else {
        await ctx.editMessageText(TEXTS.NO_SUBSCRIPTION, {
          reply_markup: {
            inline_keyboard: [
              [{ text: '\u{1F4CB} Оформити підписку', callback_data: 'subscription' }],
            ],
          },
        });
      }
    }
  });

  // Change plan — show current plan tariff detail + buttons to switch
  bot.action(/^sub:change_plan(?::(\w+))?$/, async (ctx) => {
    await ctx.answerCbQuery();
    const telegramId = ctx.from!.id;

    const activeSub = await getActiveSubscription(telegramId);
    if (!activeSub) return;

    // Which duration to display — default to current
    const currentDuration = planDuration(activeSub.plan);
    const showDuration = ctx.match?.[1] ?? currentDuration;
    const isCurrentPlan = showDuration === currentDuration;

    const detailKeys: Record<string, keyof typeof TEXTS> = {
      '1m': 'TARIFF_DETAIL_1M',
      '6m': 'TARIFF_DETAIL_6M',
      '12m': 'TARIFF_DETAIL_12M',
    };
    const detailText = TEXTS[detailKeys[showDuration]] ?? '';

    const prices = activeSub.prices as Record<string, { amount?: number; currency?: string }> | null;
    const planKey = `${activeSub.method}_${showDuration}`;
    const price = prices?.[planKey];
    const priceText = price ? `${price.amount} ${price.currency}` : '';
    const methodLabel = activeSub.method === 'card' ? '\u{1F4B3} Картка' : '\u{26A1} USDT';

    const durations = ['1m', '6m', '12m'];
    const durationLabels: Record<string, string> = { '1m': '1 місяць', '6m': '6 місяців', '12m': '12 місяців' };

    // Other plan buttons — use display_name from prices snapshot (same format as tariff keyboard)
    const planButtons = durations
      .filter((d) => d !== showDuration)
      .map((d) => {
        const pk = `${activeSub.method}_${d}`;
        const p = prices?.[pk] as { amount?: number; currency?: string; display_name?: string } | undefined;
        const name = p?.display_name ?? durationLabels[d];
        const pt = p ? ` — ${p.amount} ${p.currency}` : '';
        return [{ text: `${name}${pt}`, callback_data: `sub:change_plan:${d}` }];
      });

    const actionButtons = isCurrentPlan
      ? []
      : [[{ text: '\u{2705} Змінити', callback_data: `sub:set_plan:${showDuration}` }]];

    const backCallback = isCurrentPlan ? 'sub:back' : 'sub:change_plan';

    const header = isCurrentPlan ? '\u{1F4DD} Зміна плану\n\nПоточна підписка:\n\n' : '\u{1F4DD} Зміна плану\n\n';

    await ctx.editMessageText(
      `${header}` +
      `${detailText}\n\n` +
      `\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\n\n` +
      `\u{1F4B0} Сума: ${priceText}\n` +
      `\u{1F4B3} Метод оплати: ${methodLabel}\n` +
      `\u{1F5D3}\u{FE0F} Дата наступного платежу: ${formatDate(new Date(activeSub.expires_at))}\n\n` +
      (isCurrentPlan ? 'Доступні плани:' : 'Зміна діє з наступного продовження.'),
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            ...actionButtons,
            ...(isCurrentPlan ? planButtons : []),
            [{ text: '\u{2B05}\u{FE0F} Назад', callback_data: backCallback }],
          ],
        },
      },
    );
  });

  // Set new plan — confirmed
  bot.action(/^sub:set_plan:(\w+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const telegramId = ctx.from!.id;
    const newDuration = ctx.match[1];

    const activeSub = await getActiveSubscription(telegramId);
    if (!activeSub) return;

    const newPlan = `${activeSub.method}_${newDuration}`;

    if (newPlan === activeSub.plan) {
      await ctx.editMessageText(buildActiveText(activeSub), { reply_markup: ACTIVE_KEYBOARD });
      return;
    }

    const sub = await changeSubscriptionPlan(telegramId, newPlan);

    if (!sub) {
      await ctx.editMessageText('Не вдалося змінити план. Спробуй ще раз.', {
        reply_markup: {
          inline_keyboard: [
            [{ text: '\u{2B05}\u{FE0F} Назад', callback_data: 'sub:back' }],
          ],
        },
      });
      return;
    }

    const durationLabels: Record<string, string> = { '1m': '1 місяць', '6m': '6 місяців', '12m': '12 місяців' };
    const newLabel = durationLabels[newDuration] ?? newDuration;
    const prices = sub.prices as Record<string, { amount?: number; currency?: string }> | null;
    const price = prices?.[newPlan];
    const priceText = price ? `${price.amount} ${price.currency}` : '';

    logger.info('Subscription plan changed', { telegramId, oldPlan: activeSub.plan, newPlan });

    await ctx.editMessageText(
      `\u{2705} План змінено!\n\n` +
      `Новий план: ${newLabel}\n` +
      `Сума наступного платежу: ${priceText}\n` +
      `Дата наступного платежу: ${formatDate(new Date(sub.expires_at))}`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '\u{1F4CB} Моя підписка', callback_data: 'sub:back' }],
          ],
        },
      },
    );
  });

  // Change card
  bot.action('sub:change_card', async (ctx) => {
    await ctx.answerCbQuery();
    const telegramId = ctx.from!.id;

    const activeSub = await getActiveSubscription(telegramId);
    if (!activeSub) return;

    if (activeSub.method === 'crypto') {
      await ctx.editMessageText(
        '\u{1F4B3} Зміна картки\n\n' +
        'У тебе активна підписка з оплатою USDT. Змінити картку можна тільки якщо підписка оплачена карткою.',
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '\u{2B05}\u{FE0F} Назад', callback_data: 'sub:back' }],
            ],
          },
        },
      );
      return;
    }

    const currentCard = activeSub.card_pan ?? 'не збережена';

    await ctx.editMessageText(
      `\u{1F4B3} Зміна картки\n\n` +
      `Поточна картка: ${currentCard}\n\n` +
      `Щоб додати нову картку, буде списано 1 грн (обмеження платіжної системи).\n\n` +
      `Наступне автоматичне продовження буде з нової картки.`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '\u{1F4B3} Додати нову картку', callback_data: 'sub:new_card' }],
            [{ text: '\u{2B05}\u{FE0F} Назад', callback_data: 'sub:back' }],
          ],
        },
      },
    );
  });

  // Add new card — create 1 UAH invoice to get new recToken
  bot.action('sub:new_card', async (ctx) => {
    await ctx.answerCbQuery();
    const telegramId = ctx.from!.id;

    if (await hasPendingCardTransaction(telegramId)) {
      await ctx.editMessageText(
        'У тебе вже є активний платіж. Скористайся попереднім посиланням або зачекай 10 хвилин.',
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '\u{2B05}\u{FE0F} Назад', callback_data: 'sub:back' }],
            ],
          },
        },
      );
      return;
    }

    const orderReference = generateOrderReference(telegramId, 'cardchange');

    await createTransaction({
      telegramId,
      amount: 1,
      currency: 'UAH',
      method: 'card',
      plan: 'card_change',
      orderReference,
    });

    const result = await createInvoice({
      orderReference,
      amount: 1,
      currency: 'UAH',
      productName: 'Зміна картки ME Club',
      clientAccountId: `uid:${telegramId}`,
    });

    if (!result.success || !result.invoiceUrl) {
      logger.error('Failed to create card change invoice', { orderReference, reason: result.reason });
      await ctx.editMessageText(
        '\u{26A0}\u{FE0F} Зміна картки тимчасово недоступна. Спробуй пізніше.',
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '\u{2B05}\u{FE0F} Назад', callback_data: 'sub:back' }],
            ],
          },
        },
      );
      return;
    }

    const msg = await ctx.editMessageText(
      '\u{1F4B3} Зміна картки\n\n' +
      'Натисни кнопку нижче та введи дані нової картки.\n' +
      'Вартість: 1 грн (обмеження платіжної системи).\n\n' +
      '\u{23F3} Посилання дійсне 10 хвилин',
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '\u{1F4B3} Додати нову картку', url: result.invoiceUrl }],
            [{ text: '\u{274C} Скасувати зміну картки', callback_data: `cancel_card_change:${orderReference}` }],
          ],
        },
      },
    );

    if (msg && typeof msg === 'object' && 'message_id' in msg) {
      savePaymentMessage(orderReference, ctx.chat!.id, msg.message_id);
    }
  });

  // Cancel card change — remove invoice and cancel transaction
  bot.action(/^cancel_card_change:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const orderReference = ctx.match[1];

    await removeInvoice(orderReference);
    await updateTransactionStatus(orderReference, 'Cancelled');
    deletePaymentMessage(orderReference);

    const telegramId = ctx.from!.id;
    const activeSub = await getActiveSubscription(telegramId);
    if (activeSub) {
      await ctx.editMessageText(buildActiveText(activeSub), { reply_markup: ACTIVE_KEYBOARD });
    } else {
      const cancelledSub = await getCancelledSubscription(telegramId);
      if (cancelledSub) {
        await ctx.editMessageText(buildCancelledText(cancelledSub), { reply_markup: CANCELLED_KEYBOARD });
      } else {
        await ctx.editMessageText(TEXTS.NO_SUBSCRIPTION, {
          reply_markup: {
            inline_keyboard: [
              [{ text: '\u{1F4CB} Оформити підписку', callback_data: 'subscription' }],
            ],
          },
        });
      }
    }
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

    // Send a separate notification message so the user sees it even if they closed the chat
    const expiresDate = formatDate(sub.expires_at);
    try {
      await ctx.reply(
        `\u{1F514} Твою підписку скасовано.\n\n` +
        `Доступ до клубу залишається до ${expiresDate}.\n` +
        `Якщо передумаєш — віднови підписку в меню "Моя підписка".`,
      );
    } catch { /* ignore if reply fails */ }
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
