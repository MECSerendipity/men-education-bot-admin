import { Telegraf } from 'telegraf';
import { saveInviteLink, revokeInviteLinks, getActiveInviteLinks } from '../db/invite-links.js';
import { hasActiveSubscription, getActiveSubscription } from '../db/subscriptions.js';
import { logger } from '../utils/logger.js';
import { TEXTS, type TextKey } from '../texts/index.js';

/** Channel config: env key → text key for button label */
interface ChannelConfig {
  id: number;
  textKey: TextKey;
}

/** Read private channel IDs from individual env vars */
function getPrivateChannels(): ChannelConfig[] {
  const channels: { envKey: string; textKey: TextKey }[] = [
    { envKey: 'PRIVATE_CHANNEL_CLUB', textKey: 'BTN_INVITE_CLUB' },
    { envKey: 'PRIVATE_CHANNEL_LIBRARY', textKey: 'BTN_INVITE_LIBRARY' },
    { envKey: 'PRIVATE_CHANNEL_CHATS', textKey: 'BTN_INVITE_CHATS' },
  ];

  return channels
    .map((c) => ({ id: Number(process.env[c.envKey] ?? 0), textKey: c.textKey }))
    .filter((c) => c.id !== 0 && !isNaN(c.id));
}

/** Get just the channel IDs (for invite links) */
export function getPrivateChannelIds(): number[] {
  return getPrivateChannels().map((c) => c.id);
}

/** Get all channel IDs including kick-only channels (no invite link generated) */
function getAllKickChannelIds(): number[] {
  const ids = getPrivateChannelIds();
  const commentsId = Number(process.env.PRIVATE_CHANNEL_COMMENTS ?? 0);
  if (commentsId && !isNaN(commentsId)) ids.push(commentsId);
  return ids;
}

/** Generate invite links with join request approval for all private channels and send to user */
export async function generateAndSendInvites(bot: Telegraf, telegramId: number): Promise<void> {
  const buttons = await getInviteButtons(bot, telegramId);

  if (buttons.length > 0) {
    await bot.telegram.sendMessage(
      telegramId,
      TEXTS.INVITE_MESSAGE,
      { reply_markup: { inline_keyboard: buttons } },
    );
  }
}

/** Get invite link buttons for a user (reuses existing or generates new) */
export async function getInviteButtons(bot: Telegraf, telegramId: number): Promise<{ text: string; url: string }[][]> {
  const channels = getPrivateChannels();
  if (channels.length === 0) return [];

  const subscription = await getActiveSubscription(telegramId);
  const expiresAt = subscription?.expires_at ?? null;
  const existingLinks = await getActiveInviteLinks(telegramId);
  const buttons: { text: string; url: string }[][] = [];

  for (const channel of channels) {
    const existing = existingLinks.find((l) => l.channel_id === channel.id);
    if (existing) {
      await saveInviteLink(telegramId, channel.id, existing.invite_link, expiresAt);
      buttons.push([{ text: TEXTS[channel.textKey], url: existing.invite_link }]);
      continue;
    }

    try {
      const invite = await bot.telegram.createChatInviteLink(channel.id, {
        creates_join_request: true,
        name: `user_${telegramId}`,
      });
      await saveInviteLink(telegramId, channel.id, invite.invite_link, expiresAt);
      buttons.push([{ text: TEXTS[channel.textKey], url: invite.invite_link }]);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : JSON.stringify(err);
      logger.error(`Failed to create invite link: ${errMsg}`, { channelId: channel.id, telegramId });
    }
  }

  return buttons;
}

/** Handle chat join request — approve if user has active subscription, decline otherwise */
export function handleJoinRequest(bot: Telegraf): void {
  bot.on('chat_join_request', async (ctx) => {
    const telegramId = ctx.chatJoinRequest.from.id;
    const chatId = ctx.chatJoinRequest.chat.id;

    const isActive = await hasActiveSubscription(telegramId);

    if (isActive) {
      await ctx.approveChatJoinRequest(telegramId);
      logger.info('Approved join request', { telegramId, chatId });
    } else {
      await ctx.declineChatJoinRequest(telegramId);
      logger.info('Declined join request — no active subscription', { telegramId, chatId });
    }
  });
}

/** Revoke invite links and kick user from all private channels */
export async function revokeAccessForUser(bot: Telegraf, telegramId: number): Promise<void> {
  // Revoke stored invite links via Telegram API
  const revokedLinks = await revokeInviteLinks(telegramId);
  for (const link of revokedLinks) {
    try {
      await bot.telegram.revokeChatInviteLink(link.channel_id, link.invite_link);
    } catch (err) {
      logger.error('Failed to revoke invite link', { channelId: link.channel_id, telegramId, err });
    }
  }

  // Kick user from all channels (including kick-only channels like comments group)
  const allKickIds = getAllKickChannelIds();
  for (const channelId of allKickIds) {
    try {
      await bot.telegram.banChatMember(channelId, telegramId);
      // Unban so user can rejoin later if they resubscribe
      await bot.telegram.unbanChatMember(channelId, telegramId);
    } catch (err) {
      logger.error('Failed to kick user from channel', { channelId, telegramId, err });
    }
  }
}
