import 'dotenv/config';
import { Telegram } from 'telegraf';

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error('BOT_TOKEN not set');
  process.exit(1);
}

const telegram = new Telegram(BOT_TOKEN);

const CHANNELS = [
  { name: 'CLUB', id: Number(process.env.PRIVATE_CHANNEL_CLUB ?? 0) },
  { name: 'LIBRARY', id: Number(process.env.PRIVATE_CHANNEL_LIBRARY ?? 0) },
  { name: 'CHATS', id: Number(process.env.PRIVATE_CHANNEL_CHATS ?? 0) },
];

async function main() {
  console.log('\n=== Channel IDs from .env ===');
  for (const ch of CHANNELS) {
    console.log(`  ${ch.name}: ${ch.id} (type: ${typeof ch.id})`);
  }

  for (const ch of CHANNELS) {
    if (ch.id === 0) {
      console.log(`\n--- ${ch.name}: SKIPPED (not configured) ---`);
      continue;
    }

    console.log(`\n--- Testing ${ch.name} (${ch.id}) ---`);

    // Step 1: Can bot access this channel?
    try {
      const chat = await telegram.getChat(ch.id);
      console.log('  getChat OK:', {
        title: chat.title,
        type: chat.type,
        id: chat.id,
      });
    } catch (err) {
      console.error('  getChat FAILED:', (err as Error).message);
      continue;
    }

    // Step 2: Check bot's permissions
    try {
      const me = await telegram.getMe();
      const member = await telegram.getChatMember(ch.id, me.id);
      console.log('  Bot status:', member.status);
      if ('can_invite_users' in member) {
        console.log('  can_invite_users:', member.can_invite_users);
      }
    } catch (err) {
      console.error('  getChatMember FAILED:', (err as Error).message);
    }

    // Step 3: Create invite link WITH creates_join_request
    try {
      const link1 = await telegram.createChatInviteLink(ch.id, {
        creates_join_request: true,
        name: 'test_join_request',
      });
      console.log('  createChatInviteLink (join_request=true):', {
        invite_link: link1.invite_link,
        is_revoked: link1.is_revoked,
        expire_date: link1.expire_date,
        creates_join_request: link1.creates_join_request,
      });
      console.log(`  -> Click to test: ${link1.invite_link}`);

      // Revoke test link
      await telegram.revokeChatInviteLink(ch.id, link1.invite_link);
      console.log('  (revoked test link)');
    } catch (err) {
      console.error('  createChatInviteLink (join_request) FAILED:', (err as Error).message);
    }

    // Step 4: Create invite link WITHOUT creates_join_request (for comparison)
    try {
      const link2 = await telegram.createChatInviteLink(ch.id, {
        member_limit: 1,
        name: 'test_member_limit',
      });
      console.log('  createChatInviteLink (member_limit=1):', {
        invite_link: link2.invite_link,
        is_revoked: link2.is_revoked,
        expire_date: link2.expire_date,
        member_limit: link2.member_limit,
      });
      console.log(`  -> Click to test: ${link2.invite_link}`);

      // Revoke test link
      await telegram.revokeChatInviteLink(ch.id, link2.invite_link);
      console.log('  (revoked test link)');
    } catch (err) {
      console.error('  createChatInviteLink (member_limit) FAILED:', (err as Error).message);
    }
  }

  console.log('\n=== Done ===\n');
}

main().catch(console.error);
