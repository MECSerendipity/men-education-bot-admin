import { Telegraf } from 'telegraf';
import { TEXTS } from '../texts/index.js';
import { hasActiveSubscription, getCancelledSubscription } from '../db/subscriptions.js';
import { getOrCreateRefCode, getPartnerStats, getPartnerBalance, getPartnerConfig, getPartnerReferrals, createWithdrawalRequest, getPendingWithdrawal } from '../db/partners.js';
import { getUserByTelegramId } from '../db/users.js';
import { USDT, SUPPORT_URL, PARTNER } from '../config.js';
import { escapeHtml } from '../utils/html.js';
import { db } from '../db/index.js';
import { processWithdrawal } from '../db/partners.js';
import { logger } from '../utils/logger.js';

/** Cached bot username — resolved on first use */
let botUsername: string | null = null;

async function getBotUsername(bot: Telegraf): Promise<string> {
  if (botUsername) return botUsername;
  const me = await bot.telegram.getMe();
  botUsername = me.username;
  return botUsername;
}

/** Check subscription and show error if not active. Returns true if blocked. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function requireSubscription(ctx: any): Promise<boolean> {
  const isSubscribed = await hasActiveSubscription(ctx.from.id);
  if (!isSubscribed) {
    const cancelledSub = await getCancelledSubscription(ctx.from.id);
    const button = cancelledSub
      ? { text: '\u{2705} Відновити підписку', callback_data: 'sub:reactivate' }
      : { text: 'Оформити підписку', callback_data: 'subscription' };

    await ctx.editMessageText(
      'Реферальна система доступна тільки для користувачів з активною підпискою.',
      {
        reply_markup: {
          inline_keyboard: [[button]],
        },
      },
    );
    return true;
  }
  return false;
}

/** Register partner menu handlers */
export function registerPartnerHandler(bot: Telegraf) {
  // Main partner menu button
  bot.hears(TEXTS.BTN_PARTNER, async (ctx) => {
    const telegramId = ctx.from.id;

    const isSubscribed = await hasActiveSubscription(telegramId);
    if (!isSubscribed) {
      const cancelledSub = await getCancelledSubscription(telegramId);
      const button = cancelledSub
        ? { text: '\u{2705} Відновити підписку', callback_data: 'sub:reactivate' }
        : { text: 'Оформити підписку', callback_data: 'subscription' };

      await ctx.reply(
        'Реферальна система доступна тільки для користувачів з активною підпискою.',
        {
          reply_markup: {
            inline_keyboard: [[button]],
          },
        },
      );
      return;
    }

    await showPartnerMenu(bot, ctx);
  });

  // Referral link with share button
  bot.action('partner:link', async (ctx) => {
    await ctx.answerCbQuery();
    if (await requireSubscription(ctx)) return;
    const telegramId = ctx.from.id;
    const refCode = await getOrCreateRefCode(telegramId);
    const username = await getBotUsername(bot);
    const link = `https://t.me/${username}?start=${refCode}`;

    const shareText = encodeURIComponent(`Приєднуйся до Men Education Club!\n${link}`);
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${shareText}`;

    await ctx.editMessageText(
      `\u{1F517} *Твоє реферальне посилання:*\n\n\`${link}\`\n\n` +
      'Скопіюй посилання або натисни "Поділитися" щоб надіслати другу.',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '\u{1F4E4} Поділитися', url: shareUrl }],
            [{ text: '\u{2B05}\u{FE0F} Назад', callback_data: 'partner:menu' }],
          ],
        },
      },
    );
  });

  // Stats
  bot.action('partner:stats', async (ctx) => {
    await ctx.answerCbQuery();
    if (await requireSubscription(ctx)) return;
    const telegramId = ctx.from.id;
    const stats = await getPartnerStats(telegramId);

    const paid = stats.active + stats.inactive;

    let earningsText = 'Мої нарахування:\n';
    earningsText += `- Всього зароблено: ${stats.totalEarnedUah.toFixed(2)} UAH | Виведено: ${stats.totalWithdrawnUah.toFixed(2)} UAH\n`;
    earningsText += `- Всього зароблено: ${stats.totalEarnedUsdt.toFixed(2)} USDT | Виведено: ${stats.totalWithdrawnUsdt.toFixed(2)} USDT`;

    await ctx.editMessageText(
      `\u{1F4C8} Статистика\n\n` +
      `Перейшли за посиланням: ${stats.clicks}\n` +
      `Оплатили підписку: ${paid}\n` +
      `Активні реферали: ${stats.active}\n\n` +
      earningsText,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '\u{2B05}\u{FE0F} Назад', callback_data: 'partner:menu' }],
          ],
        },
      },
    );
  });

  // Balance
  bot.action('partner:balance', async (ctx) => {
    await ctx.answerCbQuery();
    if (await requireSubscription(ctx)) return;
    await showBalancePage(ctx);
  });

  async function showBalancePage(ctx: { from: { id: number }; editMessageText: Function }) {
    const telegramId = ctx.from.id;
    const balance = await getPartnerBalance(telegramId);
    const config = await getPartnerConfig();
    const pendingWithdrawal = await getPendingWithdrawal(telegramId);

    if (pendingWithdrawal) {
      await ctx.editMessageText(
        `\u{1F911} Баланс\n\n` +
        `Доступний баланс в UAH: ${balance.uah.toFixed(2)}\n` +
        `Доступний баланс в USDT: ${balance.usdt.toFixed(2)}\n\n` +
        `\u{23F3} Активний запит на виведення: ${Number(pendingWithdrawal.amount).toFixed(2)} ${pendingWithdrawal.currency}\n\n` +
        `Очікуйте підтвердження від адміністратора.`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '\u{2B05}\u{FE0F} Назад', callback_data: 'partner:menu' }],
            ],
          },
        },
      );
      return;
    }

    await ctx.editMessageText(
      `\u{1F911} Баланс\n\n` +
      `Доступний баланс в UAH: ${balance.uah.toFixed(2)}\n` +
      `Доступний баланс в USDT: ${balance.usdt.toFixed(2)}\n\n` +
      `Мінімальна сума виведення: ${config.min_withdrawal_uah} UAH | ${config.min_withdrawal_usdt} USDT`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '\u{1F4B4} Вивести UAH', callback_data: 'partner:withdraw:uah' },
              { text: '\u{1F4B5} Вивести USDT', callback_data: 'partner:withdraw:usdt' },
            ],
            [{ text: '\u{2B05}\u{FE0F} Назад', callback_data: 'partner:menu' }],
          ],
        },
      },
    );
  }

  // Withdraw UAH
  bot.action('partner:withdraw:uah', async (ctx) => {
    await ctx.answerCbQuery();
    const telegramId = ctx.from.id;

    const day = new Date().getDate();
    if (day < 10 || day > 20) {
      await ctx.editMessageText(
        `Заявку на виведення можна подати тільки з 10 по 20 число кожного місяця.`,
        {
          reply_markup: {
            inline_keyboard: [[{ text: '\u{2B05}\u{FE0F} Назад', callback_data: 'partner:balance' }]],
          },
        },
      );
      return;
    }

    const balance = await getPartnerBalance(telegramId);
    const config = await getPartnerConfig();

    if (balance.uah < config.min_withdrawal_uah) {
      await ctx.editMessageText(
        `Недостатньо коштів для виведення.\n\n` +
        `Мінімальна сума виведення: ${config.min_withdrawal_uah} UAH | ${config.min_withdrawal_usdt} USDT`,
        {
          reply_markup: {
            inline_keyboard: [[{ text: '\u{2B05}\u{FE0F} Назад', callback_data: 'partner:balance' }]],
          },
        },
      );
      return;
    }

    await ctx.editMessageText(
      `\u{1F4B4} Вивести ${balance.uah.toFixed(2)} UAH?\n\n` +
      `Після підтвердження ME Допомога зв'яжеться з тобою протягом 24 годин.`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '\u{2705} Підтвердити виведення', callback_data: `partner:withdraw_confirm:uah:${balance.uah.toFixed(2)}` }],
            [{ text: '\u{2B05}\u{FE0F} Назад', callback_data: 'partner:balance' }],
          ],
        },
      },
    );
  });

  // Withdraw USDT
  bot.action('partner:withdraw:usdt', async (ctx) => {
    await ctx.answerCbQuery();
    const telegramId = ctx.from.id;

    const day = new Date().getDate();
    if (day < 10 || day > 20) {
      await ctx.editMessageText(
        `Заявку на виведення можна подати тільки з 10 по 20 число кожного місяця.`,
        {
          reply_markup: {
            inline_keyboard: [[{ text: '\u{2B05}\u{FE0F} Назад', callback_data: 'partner:balance' }]],
          },
        },
      );
      return;
    }

    const balance = await getPartnerBalance(telegramId);
    const config = await getPartnerConfig();

    if (balance.usdt < config.min_withdrawal_usdt) {
      await ctx.editMessageText(
        `Недостатньо коштів для виведення.\n\n` +
        `Мінімальна сума виведення: ${config.min_withdrawal_uah} UAH | ${config.min_withdrawal_usdt} USDT`,
        {
          reply_markup: {
            inline_keyboard: [[{ text: '\u{2B05}\u{FE0F} Назад', callback_data: 'partner:balance' }]],
          },
        },
      );
      return;
    }

    await ctx.editMessageText(
      `\u{1F4B5} Вивести ${balance.usdt.toFixed(2)} USDT?\n\n` +
      `Після підтвердження ME Допомога зв'яжеться з тобою протягом 24 годин.`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '\u{2705} Підтвердити виведення', callback_data: `partner:withdraw_confirm:usdt:${balance.usdt.toFixed(2)}` }],
            [{ text: '\u{2B05}\u{FE0F} Назад', callback_data: 'partner:balance' }],
          ],
        },
      },
    );
  });

  // Confirm withdrawal
  bot.action(/^partner:withdraw_confirm:(uah|usdt):(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const telegramId = ctx.from.id;
    const currency = ctx.match[1].toUpperCase();
    const amount = Number(ctx.match[2]);

    try {
      const withdrawal = await createWithdrawalRequest(telegramId, amount, currency);
      await ctx.editMessageText(
        `\u{2705} Запит на виведення ${amount.toFixed(2)} ${currency} створено.\n\n` +
        `Очікуйте підтвердження від адміністратора.`,
        {
          reply_markup: {
            inline_keyboard: [[{ text: '\u{2B05}\u{FE0F} Назад', callback_data: 'partner:menu' }]],
          },
        },
      );
      logger.info('Withdrawal request created', { telegramId, amount, currency });

      // Send notification to admin channel (thread 7)
      if (USDT.adminChannelId) {
        const user = await getUserByTelegramId(telegramId);
        const usernameDisplay = user?.username ? `@${escapeHtml(user.username)}` : 'немає';

        try {
          await bot.telegram.sendMessage(
            USDT.adminChannelId,
            `<b>ME Partner - запит на виведення:</b>\n\n` +
            `▸ User ID: <code>${user?.id ?? 'N/A'}</code>\n` +
            `▸ Username: ${usernameDisplay}\n` +
            `▸ Telegram ID: <code>${telegramId}</code>\n` +
            `▸ Chat: <a href="tg://user?id=${telegramId}">Написати юзеру</a>\n` +
            `▸ Withdrawal ID: <code>${withdrawal.id}</code>\n` +
            `▸ Amount: ${amount.toFixed(2)} ${escapeHtml(currency)}\n` +
            `▸ Status: \u{23F3} Pending\n\n` +
            `#withdrawal`,
            {
              parse_mode: 'HTML',
              message_thread_id: Number(PARTNER.withdrawalThreadId) || undefined,
              reply_markup: {
                inline_keyboard: [
                  [
                    { text: '\u{274C} Не підтверджено', callback_data: `partner_withdraw_reject:${withdrawal.id}` },
                    { text: '\u{2705} Підтверджено', callback_data: `partner_withdraw_approve:${withdrawal.id}` },
                  ],
                ],
              },
            },
          );
        } catch (err) {
          logger.error('Failed to send withdrawal notification to admin channel', err);
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      await ctx.editMessageText(
        `Не вдалося створити запит: ${message}`,
        {
          reply_markup: {
            inline_keyboard: [[{ text: '\u{2B05}\u{FE0F} Назад', callback_data: 'partner:balance' }]],
          },
        },
      );
    }
  });

  // Admin approve/reject withdrawal from channel
  bot.action(/^partner_withdraw_(approve|reject):(\d+)$/, async (ctx) => {
    const action = ctx.match[1];
    const withdrawalId = Number(ctx.match[2]);
    const approved = action === 'approve';

    // Get withdrawal info before processing (to know partner_id and amount)
    const txResult = await db.query(
      `SELECT * FROM partner_transactions WHERE id = $1 AND type = 'withdrawal' AND status = 'pending'`,
      [withdrawalId],
    );
    const withdrawal = txResult.rows[0];
    if (!withdrawal) {
      await ctx.answerCbQuery('Цей запит вже оброблено');
      return;
    }

    const success = await processWithdrawal(withdrawalId, approved);

    if (!success) {
      await ctx.answerCbQuery('Цей запит вже оброблено');
      return;
    }

    await ctx.answerCbQuery();
    const adminUsername = ctx.from?.username ? `@${ctx.from.username}` : 'Admin';
    const amount = Number(withdrawal.amount).toFixed(2);
    const currency = withdrawal.currency;

    // Rebuild admin message with updated status (preserves HTML links)
    try {
      const user = await getUserByTelegramId(withdrawal.partner_id);
      const usernameDisplay = user?.username ? `@${escapeHtml(user.username)}` : 'немає';
      const statusLine = approved
        ? `\u{2705} Approved by ${adminUsername}`
        : `\u{274C} Rejected by ${adminUsername}`;

      await ctx.editMessageText(
        `<b>ME Partner - запит на виведення:</b>\n\n` +
        `▸ User ID: <code>${user?.id ?? 'N/A'}</code>\n` +
        `▸ Username: ${usernameDisplay}\n` +
        `▸ Telegram ID: <code>${withdrawal.partner_id}</code>\n` +
        `▸ Chat: <a href="tg://user?id=${withdrawal.partner_id}">Написати юзеру</a>\n` +
        `▸ Withdrawal ID: <code>${withdrawalId}</code>\n` +
        `▸ Amount: ${amount} ${escapeHtml(currency)}\n` +
        `▸ Status: ${statusLine}\n\n` +
        `#withdrawal`,
        { parse_mode: 'HTML' },
      );
    } catch { /* ignore edit errors */ }

    // Notify partner
    try {
      if (approved) {
        await bot.telegram.sendMessage(
          withdrawal.partner_id,
          `\u{2705} Виведення ${amount} ${currency} схвалено.\n\nME Допомога зв'яжеться з тобою протягом 24 годин.`,
        );
      } else {
        await bot.telegram.sendMessage(
          withdrawal.partner_id,
          `\u{274C} Виведення ${amount} ${currency} відхилено.\n\nКошти повернуто на баланс.`,
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: '\u{1F4E9} Написати в підтримку', url: SUPPORT_URL }],
              ],
            },
          },
        );
      }
    } catch { /* partner may have blocked bot */ }
  });

  // My referrals — show info + download button if has referrals
  bot.action('partner:referrals', async (ctx) => {
    await ctx.answerCbQuery();
    if (await requireSubscription(ctx)) return;
    const telegramId = ctx.from.id;
    const referrals = await getPartnerReferrals(telegramId);

    if (referrals.length === 0) {
      await ctx.editMessageText(
        '\u{1F465} Мої реферали\n\nУ тебе ще немає рефералів.\nНадсилай реферальне посилання друзям!',
        {
          reply_markup: {
            inline_keyboard: [[{ text: '\u{2B05}\u{FE0F} Назад', callback_data: 'partner:menu' }]],
          },
        },
      );
      return;
    }

    const active = referrals.filter(r => r.status === 'active').length;
    const inactive = referrals.filter(r => r.status === 'inactive').length;
    const paid = active + inactive;

    await ctx.editMessageText(
      `\u{1F465} Мої реферали\n\n` +
      `Перейшли за посиланням: ${referrals.length}\n` +
      `Оплатили: ${paid}\n` +
      `Активні реферали: ${active}\n\n` +
      `Завантаж звіт щоб переглянути детальну інформацію по кожному рефералу.`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '\u{1F4CB} Завантажити список', callback_data: 'partner:referrals_csv' }],
            [{ text: '\u{2B05}\u{FE0F} Назад', callback_data: 'partner:menu' }],
          ],
        },
      },
    );
  });

  // Generate and send CSV file with referrals
  bot.action('partner:referrals_csv', async (ctx) => {
    await ctx.answerCbQuery();
    const telegramId = ctx.from.id;
    const referrals = await getPartnerReferrals(telegramId);

    if (referrals.length === 0) return;

    const formatCsvDate = (d: Date | string | null): string => {
      if (!d) return '-';
      const date = new Date(d);
      return date.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' });
    };

    /** Mask username: @ivan123 -> @iv**123 */
    const maskUsername = (username: string | null): string => {
      if (!username) return '-';
      if (username.length <= 4) return `@${username[0]}**`;
      const start = username.slice(0, 2);
      const end = username.slice(-3);
      return `@${start}**${end}`;
    };

    const header = 'Username,"Clicked (дата переходу за реферальним посиланням)","Active (true - має активну підписку та приносить дохід; false - підписка неактивна)","Inactive (true - підписка закінчилась, дохід не нараховується; false - ще не оформлював підписку)"';
    const rows = referrals.map(r => {
      const username = maskUsername(r.username);
      const clicked = formatCsvDate(r.created_at);
      const active = r.status === 'active' ? 'true' : 'false';
      const inactive = r.status === 'inactive' ? 'true' : 'false';
      return `${username},${clicked},${active},${inactive}`;
    });

    const csv = [header, ...rows].join('\n');
    const buffer = Buffer.from('\uFEFF' + csv, 'utf-8'); // BOM for Excel

    try {
      await ctx.replyWithDocument(
        { source: buffer, filename: `Referrals_${ctx.from.username ?? String(telegramId)}.csv` },
        {},
      );
    } catch (err) {
      logger.error('Failed to send referrals CSV', err);
    }
  });

  // Back to partner menu
  bot.action('partner:menu', async (ctx) => {
    await ctx.answerCbQuery();
    await showPartnerMenu(bot, ctx);
  });
}

/** Show the main partner menu with referral link and inline keyboard */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function showPartnerMenu(bot: Telegraf, ctx: any): Promise<void> {
  const telegramId = ctx.from?.id ?? ctx.chat?.id;
  const refCode = await getOrCreateRefCode(telegramId);
  const username = await getBotUsername(bot);
  const config = await getPartnerConfig();
  const link = `https://t.me/${username}?start=${refCode}`;

  const firstPct = config.first_enabled ? `${config.first_percent}%` : 'вимкнено';
  const recurPct = config.recurring_enabled ? `${config.recurring_percent}%` : 'вимкнено';

  const text =
    '\u{1F680} *Реферальна система*\n\n' +
    'Заробляй разом з Men Education Club!\n' +
    'Просто поділись посиланням — і отримуй реальні гроші з кожної оплати.\n\n' +
    '\u{1F4B0} *Як це працює:*\n\n' +
    `\u{2705} ${firstPct} з першої оплати реферала\n` +
    `\u{2705} ${recurPct} з кожного автопродовження\n` +
    '\u{2705} Нарахування в UAH або USDT — залежно від способу оплати реферала\n' +
    '\u{2705} Поки реферал продовжує підписку — ти заробляєш пасивно\n\n' +
    '\u{1F4CB} *Правила:*\n\n' +
    '- Комісія нараховується з кожної успішної оплати реферала\n' +
    '- Якщо реферал не перериває підписку — ти отримуєш % з кожного продовження\n' +
    '- Якщо реферал припиняє оплату та покидає клуб — нарахування зупиняються\n' +
    '- Виведення доступне при досягненні мінімальної суми\n\n' +
    'Надсилай посилання друзям, знайомим, у соцмережі — сиди та заробляй без зусиль.';

  const keyboard = {
    parse_mode: 'Markdown' as const,
    reply_markup: {
      inline_keyboard: [
        [{ text: '\u{1F517} Моє реферальне посилання', callback_data: 'partner:link' }],
        [{ text: '\u{1F465} Мої реферали', callback_data: 'partner:referrals' }],
        [{ text: '\u{1F911} Баланс', callback_data: 'partner:balance' }],
        [{ text: '\u{1F4C8} Статистика', callback_data: 'partner:stats' }],
      ],
    },
  };

  // Try to edit message if possible (callback), otherwise send new
  if (typeof ctx.editMessageText === 'function') {
    try {
      await ctx.editMessageText(text, keyboard);
      return;
    } catch { /* fallback to reply */ }
  }
  if (typeof ctx.reply === 'function') {
    await ctx.reply(text, keyboard);
  }
}
