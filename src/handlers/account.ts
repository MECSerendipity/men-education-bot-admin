import { Telegraf } from 'telegraf';
import { TEXTS } from '../texts/index.js';
import { getUserByTelegramId, updateUserEmail } from '../db/users.js';

// Track users waiting to enter email + store the form message ID
const waitingForEmail = new Map<number, { chatId: number; messageId: number }>();

/** Build account info message lines */
function buildAccountText(user: { id: number; first_name: string; last_name?: string; username?: string }, email?: string | null, isSubscribed?: boolean, expiresAt?: Date | null) {
  const subscriptionStatus = isSubscribed
    ? `✅ Активна (до ${expiresAt ? expiresAt.toLocaleDateString('uk-UA') : '∞'})`
    : '❌ Немає';

  return [
    '<b>👤 Мій акаунт</b>',
    '',
    `Telegram ID: <code>${user.id}</code>`,
    `Ім'я: ${user.first_name}${user.last_name ? ' ' + user.last_name : ''}`,
    `Username: ${user.username ? '@' + user.username : 'не вказано'}`,
    `Email: ${email ?? 'не вказано'}`,
    `Підписка: ${subscriptionStatus}`,
  ].join('\n');
}

function buildEmailFormText(error?: string) {
  const lines = [
    '<b>👤 Мій акаунт</b>',
    'Додавання емейлу',
    '',
    'Введіть Email в форматі:',
    'name@gmail.com',
  ];

  if (error) {
    lines.push('', `⚠️ ${error}`);
  }

  return lines.join('\n');
}

/** Register "Мій акаунт" button handler */
export function registerAccountHandler(bot: Telegraf) {
  bot.hears(TEXTS.BTN_ACCOUNT, async (ctx) => {
    const dbUser = await getUserByTelegramId(ctx.from.id);

    const inlineKeyboard = dbUser?.email
      ? [{ text: '✏️ Змінити email', callback_data: 'change_email' }]
      : [{ text: '📧 Додати email', callback_data: 'add_email' }];

    await ctx.reply(buildAccountText(ctx.from, dbUser?.email, dbUser?.is_subscribed, dbUser?.expires_at), {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [inlineKeyboard],
      },
    });
  });

  // Handle add/change email button — edit message to show email form
  bot.action(['add_email', 'change_email'], async (ctx) => {
    await ctx.answerCbQuery();

    const msg = ctx.callbackQuery.message!;
    waitingForEmail.set(ctx.from.id, { chatId: msg.chat.id, messageId: msg.message_id });

    await ctx.editMessageText(buildEmailFormText(), {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: '❌ Скасувати', callback_data: 'cancel_email' }],
        ],
      },
    });
  });

  // Handle cancel — edit message back to account info
  bot.action('cancel_email', async (ctx) => {
    await ctx.answerCbQuery();
    waitingForEmail.delete(ctx.from.id);

    const dbUser = await getUserByTelegramId(ctx.from.id);
    const inlineKeyboard = dbUser?.email
      ? [{ text: '✏️ Змінити email', callback_data: 'change_email' }]
      : [{ text: '📧 Додати email', callback_data: 'add_email' }];

    await ctx.editMessageText(buildAccountText(ctx.from, dbUser?.email, dbUser?.is_subscribed, dbUser?.expires_at), {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [inlineKeyboard],
      },
    });
  });

  // Handle email input
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
          buildEmailFormText() + '\n\n✅ Email збережено!',
          { parse_mode: 'HTML' },
        );

        // After a short delay, show account info back
        setTimeout(async () => {
          const dbUser = await getUserByTelegramId(ctx.from!.id);
          const inlineKeyboard = [{ text: '✏️ Змінити email', callback_data: 'change_email' }];
          await ctx.telegram.editMessageText(chatId, messageId, undefined,
            buildAccountText(ctx.from!, dbUser?.email, dbUser?.is_subscribed, dbUser?.expires_at),
            {
              parse_mode: 'HTML',
              reply_markup: { inline_keyboard: [inlineKeyboard] },
            },
          );
        }, 1500);
      } else {
        // Show error in the same form message
        await ctx.telegram.editMessageText(chatId, messageId, undefined,
          buildEmailFormText('Невірний формат email. Спробуй ще раз'),
          {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [{ text: '❌ Скасувати', callback_data: 'cancel_email' }],
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
