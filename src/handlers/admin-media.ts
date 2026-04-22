import { Telegraf } from 'telegraf';
import { ADMIN_IDS } from '../config.js';

/** Register handler that returns file_id for media sent by admins */
export function registerAdminMediaHandler(bot: Telegraf) {
  bot.on('video_note', async (ctx, next) => {
    if (!ADMIN_IDS.includes(ctx.from.id)) return next();
    const fileId = ctx.message.video_note.file_id;
    await ctx.reply(`video_note file_id:\n\n\`${fileId}\``, { parse_mode: 'Markdown' });
  });

  bot.on('video', async (ctx, next) => {
    if (!ADMIN_IDS.includes(ctx.from.id)) return next();
    const fileId = ctx.message.video.file_id;
    await ctx.reply(`video file_id:\n\n\`${fileId}\``, { parse_mode: 'Markdown' });
  });

  bot.on('photo', async (ctx, next) => {
    if (!ADMIN_IDS.includes(ctx.from.id)) return next();
    const photos = ctx.message.photo;
    const fileId = photos[photos.length - 1].file_id;
    await ctx.reply(`photo file_id:\n\n\`${fileId}\``, { parse_mode: 'Markdown' });
  });
}
