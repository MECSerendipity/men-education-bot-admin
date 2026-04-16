import 'dotenv/config';
import { Telegram } from 'telegraf';

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error('BOT_TOKEN not set');
  process.exit(1);
}

const telegramId = Number(process.argv[2]);
if (!telegramId) {
  console.error('Usage: npx tsx scripts/unban-user.ts <telegram_id>');
  process.exit(1);
}

const telegram = new Telegram(BOT_TOKEN);

const CHANNELS = [
  { name: 'CLUB', id: Number(process.env.PRIVATE_CHANNEL_CLUB ?? 0) },
  { name: 'LIBRARY', id: Number(process.env.PRIVATE_CHANNEL_LIBRARY ?? 0) },
  { name: 'CHATS', id: Number(process.env.PRIVATE_CHANNEL_CHATS ?? 0) },
];

async function main() {
  console.log(`\nUnbanning user ${telegramId} from all channels...\n`);

  for (const ch of CHANNELS) {
    if (ch.id === 0) continue;

    try {
      // Check current status
      const member = await telegram.getChatMember(ch.id, telegramId);
      console.log(`${ch.name} (${ch.id}): current status = ${member.status}`);

      if (member.status === 'kicked' || member.status === 'left') {
        await telegram.unbanChatMember(ch.id, telegramId, { only_if_banned: true });
        console.log(`  -> Unbanned successfully`);
      } else {
        console.log(`  -> No action needed (${member.status})`);
      }
    } catch (err) {
      console.error(`  ${ch.name}: ERROR — ${(err as Error).message}`);
    }
  }

  console.log('\nDone. User can now use invite links.\n');
}

main().catch(console.error);
