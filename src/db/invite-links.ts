import { db } from './index.js';

export interface InviteLink {
  id: number;
  telegram_id: number;
  channel_id: number;
  invite_link: string;
  status: string;
  expires_at: Date | null;
  created_at: Date;
}

/** Get all active invite links for a user */
export async function getActiveInviteLinks(telegramId: number): Promise<InviteLink[]> {
  const result = await db.query(
    `SELECT * FROM invite_links WHERE telegram_id = $1 AND status = 'active'`,
    [telegramId],
  );
  return result.rows;
}

/** Save an invite link */
export async function saveInviteLink(telegramId: number, channelId: number, inviteLink: string, expiresAt: Date | null): Promise<void> {
  await db.query(
    `INSERT INTO invite_links (telegram_id, channel_id, invite_link, expires_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (telegram_id, channel_id) DO UPDATE SET
       invite_link = EXCLUDED.invite_link,
       expires_at = EXCLUDED.expires_at,
       status = 'active'`,
    [telegramId, channelId, inviteLink, expiresAt],
  );
}

/** Revoke all invite links for a user (mark as revoked in DB) */
export async function revokeInviteLinks(telegramId: number): Promise<InviteLink[]> {
  const result = await db.query(
    `UPDATE invite_links SET status = 'revoked'
     WHERE telegram_id = $1 AND status = 'active'
     RETURNING *`,
    [telegramId],
  );
  return result.rows;
}
