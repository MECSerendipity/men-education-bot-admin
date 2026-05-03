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
import { refreshMenuKeyboard } from '../keyboards/index.js';

/** Extract subscription display info */
function subInfo(sub: Subscription) {
  const startedDate = formatDate(new Date(sub.started_at));
  const expiresDate = formatDate(new Date(sub.expires_at));
  const plan = planDisplayName(sub.plan);
  const method = sub.method === 'card' ? TEXTS.METHOD_LABEL_CARD : TEXTS.METHOD_LABEL_USDT;
  const prices = sub.prices as Record<string, { amount?: number; currency?: string }> | null;
  const planPrice = prices?.[sub.plan];
  const priceText = planPrice ? `${planPrice.amount} ${planPrice.currency}` : '-';
  return { startedDate, expiresDate, plan, method, priceText };
}

function fillSubTemplate(template: string, vars: Record<string, string>): string {
  let result = template;
  for (const [key, val] of Object.entries(vars)) {
    result = result.replaceAll(`{${key}}`, val);
  }
  return result;
}

function buildActiveText(sub: Subscription): string {
  const { startedDate, expiresDate, plan, method, priceText } = subInfo(sub);
  return fillSubTemplate(TEXTS.MY_SUB_ACTIVE, { startedDate, expiresDate, plan, method, priceText });
}

function buildCancelledText(sub: Subscription): string {
  const { startedDate, expiresDate, plan, method, priceText } = subInfo(sub);
  return fillSubTemplate(TEXTS.MY_SUB_CANCELLED, { startedDate, expiresDate, plan, method, priceText });
}

/** Keyboards */
function activeKeyboard() {
  return {
    inline_keyboard: [
      [{ text: TEXTS.BTN_MY_CLUB_LINKS, callback_data: 'sub:my_links' }],
      [{ text: TEXTS.BTN_MANAGE_SUBSCRIPTION, callback_data: 'sub:manage' }],
    ],
  };
}

function manageKeyboard() {
  return {
    inline_keyboard: [
      [{ text: TEXTS.BTN_CHANGE_PLAN, callback_data: 'sub:change_plan' }],
      [{ text: TEXTS.BTN_CHANGE_METHOD, callback_data: 'sub:change_method' }],
      [{ text: TEXTS.BTN_CHANGE_CARD, callback_data: 'sub:change_card' }],
      [{ text: TEXTS.BTN_CANCEL_SUBSCRIPTION, callback_data: 'sub:cancel' }],
      [{ text: TEXTS.BTN_BACK, callback_data: 'sub:back' }],
    ],
  };
}

function cancelledKeyboard() {
  return {
    inline_keyboard: [
      [{ text: TEXTS.BTN_REACTIVATE, callback_data: 'sub:reactivate' }],
    ],
  };
}

function cancelConfirmKeyboard() {
  return {
    inline_keyboard: [
      [{ text: TEXTS.BTN_YES_CANCEL, callback_data: 'sub:cancel_confirm' }],
      [{ text: TEXTS.BTN_NO_GO_BACK, callback_data: 'sub:manage' }],
    ],
  };
}

/** Show fallback when subscription is not active (cancelled or no subscription) */
async function showInactiveFallback(ctx: { from: { id: number }; editMessageText: Function }, telegramId: number): Promise<void> {
  const cancelledSub = await getCancelledSubscription(telegramId);
  if (cancelledSub) {
    await ctx.editMessageText(buildCancelledText(cancelledSub), { reply_markup: cancelledKeyboard() });
  } else {
    await ctx.editMessageText(TEXTS.NO_SUBSCRIPTION, {
      reply_markup: {
        inline_keyboard: [
          [{ text: TEXTS.BTN_SUBSCRIBE, callback_data: 'subscription' }],
        ],
      },
    });
  }
}

/** Register "Моя підписка" button handler */
export function registerMySubscriptionHandler(bot: Telegraf) {
  bot.hears(TEXTS.BTN_MY_SUBSCRIPTION, async (ctx) => {
    const activeSub = await getActiveSubscription(ctx.from.id);
    if (activeSub) {
      await ctx.reply(buildActiveText(activeSub), { reply_markup: activeKeyboard() });
      return;
    }

    const cancelledSub = await getCancelledSubscription(ctx.from.id);
    if (cancelledSub) {
      await ctx.reply(buildCancelledText(cancelledSub), { reply_markup: cancelledKeyboard() });
      return;
    }

    await ctx.reply(TEXTS.NO_SUBSCRIPTION, {
      reply_markup: {
        inline_keyboard: [
          [{ text: TEXTS.BTN_SUBSCRIBE, callback_data: 'subscription' }],
        ],
      },
    });
  });

  // Manage subscription — show management buttons
  bot.action('sub:manage', async (ctx) => {
    await ctx.answerCbQuery();
    const activeSub = await getActiveSubscription(ctx.from!.id);
    if (!activeSub) { await showInactiveFallback(ctx, ctx.from!.id); return; }

    await ctx.editMessageText(buildActiveText(activeSub), { reply_markup: manageKeyboard() });
  });

  // My club links
  bot.action('sub:my_links', async (ctx) => {
    await ctx.answerCbQuery();
    const telegramId = ctx.from!.id;

    const activeSub = await getActiveSubscription(telegramId);
    if (!activeSub) { await showInactiveFallback(ctx, ctx.from!.id); return; }

    const linkButtons = await getInviteButtons(bot, telegramId);

    await ctx.editMessageReplyMarkup({
      inline_keyboard: [
        ...linkButtons,
        [{ text: TEXTS.BTN_BACK, callback_data: 'sub:back' }],
      ],
    });
  });

  // Change payment method
  bot.action('sub:change_method', async (ctx) => {
    await ctx.answerCbQuery();
    const telegramId = ctx.from!.id;

    const activeSub = await getActiveSubscription(telegramId);
    if (!activeSub) { await showInactiveFallback(ctx, ctx.from!.id); return; }

    const currentMethod = activeSub.method === 'card' ? TEXTS.METHOD_LABEL_CARD : TEXTS.METHOD_LABEL_USDT;
    const targetMethod = activeSub.method === 'card' ? TEXTS.METHOD_LABEL_USDT : TEXTS.METHOD_LABEL_CARD;
    const targetKey = activeSub.method === 'card' ? 'crypto' : 'card';

    if (targetKey === 'crypto') {
      // card → crypto: instant switch
      await ctx.editMessageText(
        fillSubTemplate(TEXTS.METHOD_CARD_TO_CRYPTO, { currentMethod, targetMethod }),
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: TEXTS.BTN_SWITCH_TO_USDT, callback_data: 'sub:switch_to_crypto' }],
              [{ text: TEXTS.BTN_BACK, callback_data: 'sub:manage' }],
            ],
          },
        },
      );
    } else {
      // crypto → card: needs 1 UAH verification
      await ctx.editMessageText(
        fillSubTemplate(TEXTS.METHOD_CRYPTO_TO_CARD, { currentMethod, targetMethod }),
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: TEXTS.BTN_ADD_CARD, callback_data: 'sub:switch_to_card' }],
              [{ text: TEXTS.BTN_BACK, callback_data: 'sub:manage' }],
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
    if (!activeSub) { await showInactiveFallback(ctx, ctx.from!.id); return; }

    const newPlan = switchPlanMethod(activeSub.plan, 'crypto');
    const sub = await changePaymentMethod(telegramId, 'crypto', newPlan);

    if (!sub) {
      await ctx.editMessageText(TEXTS.CHANGE_METHOD_ERROR);
      return;
    }

    logger.info('Payment method changed to crypto', { telegramId, oldPlan: activeSub.plan, newPlan });

    await ctx.editMessageText(
      TEXTS.METHOD_CHANGED_TO_CRYPTO,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: TEXTS.BTN_MY_SUB_INLINE, callback_data: 'sub:back' }],
          ],
        },
      },
    );
  });

  // Switch to card — 1 UAH invoice to get recToken
  bot.action('sub:switch_to_card', async (ctx) => {
    await ctx.answerCbQuery();
    const telegramId = ctx.from!.id;

    const activeSub = await getActiveSubscription(telegramId);
    if (!activeSub) { await showInactiveFallback(ctx, telegramId); return; }

    if (await hasPendingCardTransaction(telegramId)) {
      await ctx.editMessageText(
        TEXTS.PENDING_CARD_PAYMENT,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: TEXTS.BTN_BACK, callback_data: 'sub:manage' }],
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
        TEXTS.CHANGE_METHOD_UNAVAILABLE,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: TEXTS.BTN_BACK, callback_data: 'sub:manage' }],
            ],
          },
        },
      );
      return;
    }

    const msg = await ctx.editMessageText(
      TEXTS.ADD_CARD_INVOICE,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: TEXTS.BTN_ADD_CARD, url: result.invoiceUrl }],
            [{ text: TEXTS.BTN_CANCEL_METHOD_CHANGE, callback_data: `cancel_method_change:${orderReference}` }],
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
      await ctx.editMessageText(buildActiveText(activeSub), { reply_markup: activeKeyboard() });
    } else {
      const cancelledSub = await getCancelledSubscription(telegramId);
      if (cancelledSub) {
        await ctx.editMessageText(buildCancelledText(cancelledSub), { reply_markup: cancelledKeyboard() });
      } else {
        await ctx.editMessageText(TEXTS.NO_SUBSCRIPTION, {
          reply_markup: {
            inline_keyboard: [
              [{ text: TEXTS.BTN_SUBSCRIBE, callback_data: 'subscription' }],
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
    if (!activeSub) { await showInactiveFallback(ctx, ctx.from!.id); return; }

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
    const methodLabel = activeSub.method === 'card' ? TEXTS.METHOD_LABEL_CARD : TEXTS.METHOD_LABEL_USDT;

    const durations = ['1m', '6m', '12m'];
    const durationLabels: Record<string, string> = { '1m': TEXTS.DURATION_1M, '6m': TEXTS.DURATION_6M, '12m': TEXTS.DURATION_12M };

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
      : [[{ text: TEXTS.BTN_CHANGE_CONFIRM, callback_data: `sub:set_plan:${showDuration}` }]];

    const backCallback = isCurrentPlan ? 'sub:manage' : 'sub:change_plan';

    const header = isCurrentPlan ? TEXTS.CHANGE_PLAN_CURRENT : TEXTS.CHANGE_PLAN_OTHER;

    await ctx.editMessageText(
      `${header}` +
      `${detailText}\n\n` +
      `\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\n\n` +
      `\u{1F4B0} Сума: ${priceText}\n` +
      `\u{1F4B3} Метод оплати: ${methodLabel}\n` +
      `\u{1F5D3}\u{FE0F} Дата наступного платежу: ${formatDate(new Date(activeSub.expires_at))}\n\n` +
      (isCurrentPlan ? TEXTS.AVAILABLE_PLANS : TEXTS.PLAN_CHANGE_EFFECTIVE),
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            ...actionButtons,
            ...(isCurrentPlan ? planButtons : []),
            [{ text: TEXTS.BTN_BACK, callback_data: backCallback }],
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
    if (!activeSub) { await showInactiveFallback(ctx, ctx.from!.id); return; }

    const newPlan = `${activeSub.method}_${newDuration}`;

    if (newPlan === activeSub.plan) {
      await ctx.editMessageText(buildActiveText(activeSub), { reply_markup: activeKeyboard() });
      return;
    }

    const sub = await changeSubscriptionPlan(telegramId, newPlan);

    if (!sub) {
      await ctx.editMessageText(TEXTS.CHANGE_PLAN_ERROR, {
        reply_markup: {
          inline_keyboard: [
            [{ text: TEXTS.BTN_BACK, callback_data: 'sub:manage' }],
          ],
        },
      });
      return;
    }

    const durationLabels: Record<string, string> = { '1m': TEXTS.DURATION_1M, '6m': TEXTS.DURATION_6M, '12m': TEXTS.DURATION_12M };
    const newLabel = durationLabels[newDuration] ?? newDuration;
    const prices = sub.prices as Record<string, { amount?: number; currency?: string }> | null;
    const price = prices?.[newPlan];
    const priceText = price ? `${price.amount} ${price.currency}` : '';

    logger.info('Subscription plan changed', { telegramId, oldPlan: activeSub.plan, newPlan });

    await ctx.editMessageText(
      fillSubTemplate(TEXTS.PLAN_CHANGED_SUCCESS, { planLabel: newLabel, priceText, expiresDate: formatDate(new Date(sub.expires_at)) }),
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: TEXTS.BTN_MY_SUB_INLINE, callback_data: 'sub:back' }],
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
    if (!activeSub) { await showInactiveFallback(ctx, ctx.from!.id); return; }

    if (activeSub.method === 'crypto') {
      await ctx.editMessageText(
        TEXTS.CHANGE_CARD_CRYPTO_ONLY,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: TEXTS.BTN_BACK, callback_data: 'sub:manage' }],
            ],
          },
        },
      );
      return;
    }

    const currentCard = activeSub.card_pan ?? TEXTS.CARD_NOT_SAVED;

    await ctx.editMessageText(
      TEXTS.CHANGE_CARD_TEXT.replace('{cardPan}', currentCard),
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: TEXTS.BTN_ADD_NEW_CARD, callback_data: 'sub:new_card' }],
            [{ text: TEXTS.BTN_BACK, callback_data: 'sub:manage' }],
          ],
        },
      },
    );
  });

  // Add new card — create 1 UAH invoice to get new recToken
  bot.action('sub:new_card', async (ctx) => {
    await ctx.answerCbQuery();
    const telegramId = ctx.from!.id;

    const activeSub = await getActiveSubscription(telegramId);
    if (!activeSub) { await showInactiveFallback(ctx, telegramId); return; }

    if (await hasPendingCardTransaction(telegramId)) {
      await ctx.editMessageText(
        TEXTS.PENDING_CARD_PAYMENT,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: TEXTS.BTN_BACK, callback_data: 'sub:manage' }],
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
        TEXTS.CHANGE_CARD_UNAVAILABLE,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: TEXTS.BTN_BACK, callback_data: 'sub:manage' }],
            ],
          },
        },
      );
      return;
    }

    const msg = await ctx.editMessageText(
      TEXTS.CHANGE_CARD_INVOICE,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: TEXTS.BTN_ADD_NEW_CARD, url: result.invoiceUrl }],
            [{ text: TEXTS.BTN_CANCEL_CARD_CHANGE, callback_data: `cancel_card_change:${orderReference}` }],
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
      await ctx.editMessageText(buildActiveText(activeSub), { reply_markup: activeKeyboard() });
    } else {
      const cancelledSub = await getCancelledSubscription(telegramId);
      if (cancelledSub) {
        await ctx.editMessageText(buildCancelledText(cancelledSub), { reply_markup: cancelledKeyboard() });
      } else {
        await ctx.editMessageText(TEXTS.NO_SUBSCRIPTION, {
          reply_markup: {
            inline_keyboard: [
              [{ text: TEXTS.BTN_SUBSCRIBE, callback_data: 'subscription' }],
            ],
          },
        });
      }
    }
  });

  // Cancel subscription — show confirmation
  bot.action('sub:cancel', async (ctx) => {
    await ctx.answerCbQuery();
    const activeSub = await getActiveSubscription(ctx.from!.id);
    if (!activeSub) { await showInactiveFallback(ctx, ctx.from!.id); return; }
    await ctx.editMessageText(
      TEXTS.CANCEL_SUBSCRIPTION_CONFIRM,
      { reply_markup: cancelConfirmKeyboard() },
    );
  });

  // Cancel subscription — confirmed
  bot.action('sub:cancel_confirm', async (ctx) => {
    await ctx.answerCbQuery();
    const activeSub = await getActiveSubscription(ctx.from!.id);
    if (!activeSub) { await showInactiveFallback(ctx, ctx.from!.id); return; }
    const sub = await cancelSubscription(ctx.from!.id);
    if (!sub) {
      await ctx.editMessageText(TEXTS.SUBSCRIPTION_NOT_FOUND_OR_CANCELLED);
      return;
    }

    logger.info('Subscription cancelled by user', { telegramId: ctx.from!.id, subscriptionId: sub.id });

    await ctx.editMessageText(buildCancelledText(sub), { reply_markup: cancelledKeyboard() });
  });

  // Reactivate cancelled subscription
  bot.action('sub:reactivate', async (ctx) => {
    await ctx.answerCbQuery();
    const sub = await reactivateSubscription(ctx.from!.id);
    if (!sub) {
      await ctx.editMessageText(TEXTS.SUBSCRIPTION_NOT_FOUND_OR_EXPIRED);
      return;
    }

    logger.info('Subscription reactivated by user', { telegramId: ctx.from!.id, subscriptionId: sub.id });

    await ctx.editMessageText(
      TEXTS.SUBSCRIPTION_REACTIVATED,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: TEXTS.BTN_CHECK_SUBSCRIPTION, callback_data: 'sub:back' }],
          ],
        },
      },
    );

    await refreshMenuKeyboard(bot, ctx.from!.id, true);
  });

  // Back to subscription info
  bot.action('sub:back', async (ctx) => {
    await ctx.answerCbQuery();
    const telegramId = ctx.from!.id;

    const activeSub = await getActiveSubscription(telegramId);
    if (activeSub) {
      await ctx.editMessageText(buildActiveText(activeSub), { reply_markup: activeKeyboard() });
      return;
    }

    const cancelledSub = await getCancelledSubscription(telegramId);
    if (cancelledSub) {
      await ctx.editMessageText(buildCancelledText(cancelledSub), { reply_markup: cancelledKeyboard() });
      return;
    }

    await ctx.editMessageText(TEXTS.NO_SUBSCRIPTION, {
      reply_markup: {
        inline_keyboard: [
          [{ text: TEXTS.BTN_SUBSCRIBE, callback_data: 'subscription' }],
        ],
      },
    });
  });
}
