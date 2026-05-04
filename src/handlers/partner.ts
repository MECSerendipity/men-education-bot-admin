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
      ? { text: TEXTS.BTN_REACTIVATE, callback_data: 'sub:reactivate' }
      : { text: TEXTS.BTN_SUBSCRIBE_PARTNER, callback_data: 'subscription' };

    await ctx.editMessageText(
      TEXTS.PARTNER_SUBSCRIPTION_REQUIRED,
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
        ? { text: TEXTS.BTN_REACTIVATE, callback_data: 'sub:reactivate' }
        : { text: TEXTS.BTN_SUBSCRIBE_PARTNER, callback_data: 'subscription' };

      await ctx.reply(
        TEXTS.PARTNER_SUBSCRIPTION_REQUIRED,
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

    const shareText = encodeURIComponent(TEXTS.SHARE__REFFERALS_TEXT);
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${shareText}`;

    await ctx.editMessageText(
      TEXTS.PARTNER_REFERRAL_LINK.replace('{link}', link),
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: TEXTS.BTN_SHARE_REFERRAL, url: shareUrl }],
            [{ text: TEXTS.BTN_BACK, callback_data: 'partner:menu' }],
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

    await ctx.editMessageText(
      TEXTS.PARTNER_STATS
        .replace('{clicks}', String(stats.clicks))
        .replace('{paid}', String(paid))
        .replace('{active}', String(stats.active))
        .replace('{earnedUah}', stats.totalEarnedUah.toFixed(2))
        .replace('{withdrawnUah}', stats.totalWithdrawnUah.toFixed(2))
        .replace('{earnedUsdt}', stats.totalEarnedUsdt.toFixed(2))
        .replace('{withdrawnUsdt}', stats.totalWithdrawnUsdt.toFixed(2)),
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: TEXTS.BTN_BACK, callback_data: 'partner:menu' }],
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
        TEXTS.PARTNER_BALANCE_PENDING
          .replace('{balanceUah}', balance.uah.toFixed(2))
          .replace('{balanceUsdt}', balance.usdt.toFixed(2))
          .replace('{pendingAmount}', Number(pendingWithdrawal.amount).toFixed(2))
          .replace('{pendingCurrency}', pendingWithdrawal.currency),
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: TEXTS.BTN_BACK, callback_data: 'partner:menu' }],
            ],
          },
        },
      );
      return;
    }

    await ctx.editMessageText(
      TEXTS.PARTNER_BALANCE
        .replace('{balanceUah}', balance.uah.toFixed(2))
        .replace('{balanceUsdt}', balance.usdt.toFixed(2))
        .replace('{minUah}', String(config.min_withdrawal_uah))
        .replace('{minUsdt}', String(config.min_withdrawal_usdt)),
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: TEXTS.BTN_WITHDRAW_UAH, callback_data: 'partner:withdraw:uah' },
              { text: TEXTS.BTN_WITHDRAW_USDT, callback_data: 'partner:withdraw:usdt' },
            ],
            [{ text: TEXTS.BTN_BACK, callback_data: 'partner:menu' }],
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
    if (day < 3 || day > 20) {
      await ctx.editMessageText(
        TEXTS.WITHDRAW_DATE_RESTRICTION,
        {
          reply_markup: {
            inline_keyboard: [[{ text: TEXTS.BTN_BACK, callback_data: 'partner:balance' }]],
          },
        },
      );
      return;
    }

    const balance = await getPartnerBalance(telegramId);
    const config = await getPartnerConfig();

    if (balance.uah < config.min_withdrawal_uah) {
      await ctx.editMessageText(
        TEXTS.WITHDRAW_INSUFFICIENT
          .replace('{minUah}', String(config.min_withdrawal_uah))
          .replace('{minUsdt}', String(config.min_withdrawal_usdt)),
        {
          reply_markup: {
            inline_keyboard: [[{ text: TEXTS.BTN_BACK, callback_data: 'partner:balance' }]],
          },
        },
      );
      return;
    }

    await ctx.editMessageText(
      TEXTS.WITHDRAW_CONFIRM.replace('{amount}', balance.uah.toFixed(2)).replace('{currency}', 'UAH'),
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: TEXTS.BTN_CONFIRM_WITHDRAWAL, callback_data: `partner:withdraw_confirm:uah:${balance.uah.toFixed(2)}` }],
            [{ text: TEXTS.BTN_BACK, callback_data: 'partner:balance' }],
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
    if (day < 3 || day > 20) {
      await ctx.editMessageText(
        TEXTS.WITHDRAW_DATE_RESTRICTION,
        {
          reply_markup: {
            inline_keyboard: [[{ text: TEXTS.BTN_BACK, callback_data: 'partner:balance' }]],
          },
        },
      );
      return;
    }

    const balance = await getPartnerBalance(telegramId);
    const config = await getPartnerConfig();

    if (balance.usdt < config.min_withdrawal_usdt) {
      await ctx.editMessageText(
        TEXTS.WITHDRAW_INSUFFICIENT
          .replace('{minUah}', String(config.min_withdrawal_uah))
          .replace('{minUsdt}', String(config.min_withdrawal_usdt)),
        {
          reply_markup: {
            inline_keyboard: [[{ text: TEXTS.BTN_BACK, callback_data: 'partner:balance' }]],
          },
        },
      );
      return;
    }

    await ctx.editMessageText(
      TEXTS.WITHDRAW_CONFIRM.replace('{amount}', balance.usdt.toFixed(2)).replace('{currency}', 'USDT'),
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: TEXTS.BTN_CONFIRM_WITHDRAWAL, callback_data: `partner:withdraw_confirm:usdt:${balance.usdt.toFixed(2)}` }],
            [{ text: TEXTS.BTN_BACK, callback_data: 'partner:balance' }],
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
        TEXTS.WITHDRAW_REQUEST_CREATED.replace('{amount}', amount.toFixed(2)).replace('{currency}', currency),
        {
          reply_markup: {
            inline_keyboard: [[{ text: TEXTS.BTN_BACK, callback_data: 'partner:menu' }]],
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
        TEXTS.WITHDRAWAL_CREATE_ERROR,
        {
          reply_markup: {
            inline_keyboard: [[{ text: TEXTS.BTN_BACK, callback_data: 'partner:balance' }]],
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
      await ctx.answerCbQuery(TEXTS.WITHDRAWAL_ALREADY_PROCESSED);
      return;
    }

    const success = await processWithdrawal(withdrawalId, approved);

    if (!success) {
      await ctx.answerCbQuery(TEXTS.WITHDRAWAL_ALREADY_PROCESSED);
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
          TEXTS.WITHDRAW_APPROVED.replace('{amount}', amount).replace('{currency}', currency),
        );
      } else {
        await bot.telegram.sendMessage(
          withdrawal.partner_id,
          TEXTS.WITHDRAW_REJECTED.replace('{amount}', amount).replace('{currency}', currency),
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: TEXTS.BTN_WRITE_SUPPORT_PARTNER, url: SUPPORT_URL }],
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
        TEXTS.PARTNER_NO_REFERRALS,
        {
          reply_markup: {
            inline_keyboard: [[{ text: TEXTS.BTN_BACK, callback_data: 'partner:menu' }]],
          },
        },
      );
      return;
    }

    const active = referrals.filter(r => r.status === 'active').length;
    const inactive = referrals.filter(r => r.status === 'inactive').length;
    const paid = active + inactive;

    await ctx.editMessageText(
      TEXTS.PARTNER_REFERRALS_LIST
        .replace('{total}', String(referrals.length))
        .replace('{paid}', String(paid))
        .replace('{active}', String(active)),
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: TEXTS.BTN_DOWNLOAD_REFERRALS, callback_data: 'partner:referrals_csv' }],
            [{ text: TEXTS.BTN_BACK, callback_data: 'partner:menu' }],
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

    const header = 'Username,"Clicked (дата переходу за реферальним посиланням)","Active (true - має активну підписку та приносить дохід; false - підписка неактивна)","Inactive (true - підписка закінчилась, дохід не нараховується; false - ще не скасовував підписку)"';
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

  const firstPct = config.first_enabled ? `${config.first_percent}%` : TEXTS.COMMISSION_DISABLED;
  const recurPct = config.recurring_enabled ? `${config.recurring_percent}%` : TEXTS.COMMISSION_DISABLED;

  const text = TEXTS.PARTNER_MENU_TEXT
    .replace('{firstPct}', firstPct)
    .replace('{recurPct}', recurPct) +
    '\n\n' + TEXTS.PARTNER_CONTENT_CHANNEL;

  const keyboard = {
    parse_mode: 'Markdown' as const,
    reply_markup: {
      inline_keyboard: [
        [{ text: TEXTS.BTN_MY_REFERRAL_LINK, callback_data: 'partner:link' }],
        [{ text: TEXTS.BTN_MY_REFERRALS, callback_data: 'partner:referrals' }],
        [{ text: TEXTS.BTN_BALANCE, callback_data: 'partner:balance' }],
        [{ text: TEXTS.BTN_STATS, callback_data: 'partner:stats' }],
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
