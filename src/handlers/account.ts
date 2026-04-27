import { Telegraf } from 'telegraf';
import { TEXTS } from '../texts/index.js';
import { getUserByTelegramId, updateUserEmail } from '../db/users.js';
import { getActiveSubscription, getCancelledSubscription } from '../db/subscriptions.js';
import { escapeHtml } from '../utils/html.js';
import { logger } from '../utils/logger.js';
import { createTtlMap } from '../utils/ttl-map.js';

/** Email form state with TTL for automatic cleanup */
interface EmailFormState {
  chatId: number;
  messageId: number;
  createdAt: number;
}

/** Track users waiting to enter email — entries auto-expire after 10 minutes */
const waitingForEmail = createTtlMap<EmailFormState>(10 * 60 * 1000);

/** Build account info message lines (HTML-safe) */
async function buildAccountText(
  user: { id: number; first_name: string; last_name?: string; username?: string },
  email?: string | null,
) {
  const activeSub = await getActiveSubscription(user.id);
  const cancelledSub = !activeSub ? await getCancelledSubscription(user.id) : null;
  const subscriptionStatus = activeSub
    ? TEXTS.ACCOUNT_SUBSCRIPTION_ACTIVE
    : cancelledSub
      ? TEXTS.ACCOUNT_SUBSCRIPTION_CANCELLED
      : TEXTS.ACCOUNT_SUBSCRIPTION_NONE;

  return TEXTS.ACCOUNT_INFO
    .replace('{title}', TEXTS.ACCOUNT_TITLE)
    .replace('{telegramId}', String(user.id))
    .replace('{name}', `${escapeHtml(user.first_name)}${user.last_name ? ' ' + escapeHtml(user.last_name) : ''}`)
    .replace('{username}', user.username ? '@' + escapeHtml(user.username) : TEXTS.ACCOUNT_NOT_SET)
    .replace('{email}', email ? escapeHtml(email) : TEXTS.ACCOUNT_NOT_SET)
    .replace('{subscriptionStatus}', subscriptionStatus);
}

function buildEmailFormText(error?: string) {
  const lines = [
    TEXTS.ACCOUNT_TITLE,
    TEXTS.ACCOUNT_EMAIL_FORM_TITLE,
    '',
    TEXTS.ACCOUNT_EMAIL_FORM_INSTRUCTION,
  ];

  if (error) {
    lines.push('', `⚠️ ${escapeHtml(error)}`);
  }

  return lines.join('\n');
}

/** Build inline keyboard for account view */
function buildAccountKeyboard(hasEmail: boolean, isCancelled: boolean) {
  const row = [
    hasEmail
      ? { text: TEXTS.BTN_CHANGE_EMAIL, callback_data: 'change_email' }
      : { text: TEXTS.BTN_ADD_EMAIL, callback_data: 'add_email' },
  ];
  if (isCancelled) {
    row.push({ text: TEXTS.BTN_REACTIVATE, callback_data: 'sub:reactivate' });
  }
  return { inline_keyboard: [row] };
}

/** Register "Мій акаунт" button handler */
export function registerAccountHandler(bot: Telegraf) {
  bot.hears(TEXTS.BTN_ACCOUNT, async (ctx) => {
    const dbUser = await getUserByTelegramId(ctx.from.id);
    const activeSub = await getActiveSubscription(ctx.from.id);
    const cancelledSub = !activeSub ? await getCancelledSubscription(ctx.from.id) : null;

    await ctx.reply(
      await buildAccountText(ctx.from, dbUser?.email),
      {
        parse_mode: 'HTML',
        reply_markup: buildAccountKeyboard(!!dbUser?.email, !!cancelledSub),
      },
    );
  });

  // Handle add/change email button — edit message to show email form
  bot.action(['add_email', 'change_email'], async (ctx) => {
    await ctx.answerCbQuery();

    const msg = ctx.callbackQuery.message!;
    waitingForEmail.set(ctx.from.id, {
      chatId: msg.chat.id,
      messageId: msg.message_id,
      createdAt: Date.now(),
    });

    await ctx.editMessageText(buildEmailFormText(), {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: TEXTS.BTN_CANCEL_EMAIL, callback_data: 'cancel_email' }],
        ],
      },
    });
  });

  // Handle cancel — edit message back to account info
  bot.action('cancel_email', async (ctx) => {
    await ctx.answerCbQuery();
    waitingForEmail.delete(ctx.from.id);

    const dbUser = await getUserByTelegramId(ctx.from.id);
    const cancelled = await getCancelledSubscription(ctx.from.id);

    await ctx.editMessageText(
      await buildAccountText(ctx.from, dbUser?.email),
      {
        parse_mode: 'HTML',
        reply_markup: buildAccountKeyboard(!!dbUser?.email, !!cancelled),
      },
    );
  });

  // Handle email input — only intercepts messages from users in email-entry mode
  bot.use(async (ctx, next) => {
    if (
      ctx.message &&
      'text' in ctx.message &&
      waitingForEmail.has(ctx.from!.id)
    ) {
      const { chatId, messageId } = waitingForEmail.get(ctx.from!.id)!;
      const email = ctx.message.text.trim();

      // Delete user's input message
      await ctx.deleteMessage().catch(() => {});

      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        await updateUserEmail(ctx.from!.id, email);
        waitingForEmail.delete(ctx.from!.id);

        // Show success, then revert to account info
        await ctx.telegram.editMessageText(chatId, messageId, undefined,
          buildEmailFormText() + '\n\n' + TEXTS.ACCOUNT_EMAIL_SAVED_INLINE,
          { parse_mode: 'HTML' },
        );

        // After a short delay, show account info back
        setTimeout(async () => {
          try {
            const dbUser = await getUserByTelegramId(ctx.from!.id);
            const cancelled = await getCancelledSubscription(ctx.from!.id);
            await ctx.telegram.editMessageText(chatId, messageId, undefined,
              await buildAccountText(ctx.from!, dbUser?.email),
              {
                parse_mode: 'HTML',
                reply_markup: buildAccountKeyboard(true, !!cancelled),
              },
            );
          } catch (err) {
            logger.error('Failed to update account message after email save', err);
          }
        }, 1500);
      } else {
        // Show error in the same form message
        await ctx.telegram.editMessageText(chatId, messageId, undefined,
          buildEmailFormText(TEXTS.ACCOUNT_EMAIL_INVALID_INLINE),
          {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [{ text: TEXTS.BTN_CANCEL_EMAIL, callback_data: 'cancel_email' }],
              ],
            },
          },
        ).catch(() => {});
      }
      return;
    }

    return next();
  });
}
