import { db } from './index.js';

export interface User {
  id: number;
  telegram_id: number;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  is_subscribed: boolean;
  subscribed_at: Date | null;
  expires_at: Date | null;
  rec_token: string | null;
  card_pan: string | null;
  created_at: Date;
  updated_at: Date;
}

/** Find or create user by telegram_id, update profile info */
export async function upsertUser(telegramUser: {
  id: number;
  username?: string;
  first_name: string;
  last_name?: string;
}): Promise<User> {
  const result = await db.query(
    `INSERT INTO users (telegram_id, username, first_name, last_name)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (telegram_id) DO UPDATE SET
       username = EXCLUDED.username,
       first_name = EXCLUDED.first_name,
       last_name = EXCLUDED.last_name,
       updated_at = NOW()
     RETURNING *`,
    [telegramUser.id, telegramUser.username ?? null, telegramUser.first_name, telegramUser.last_name ?? null],
  );
  return result.rows[0];
}

/** Get user by telegram_id */
export async function getUserByTelegramId(telegramId: number): Promise<User | null> {
  const result = await db.query(
    'SELECT * FROM users WHERE telegram_id = $1',
    [telegramId],
  );
  return result.rows[0] ?? null;
}

/** Update user email */
export async function updateUserEmail(telegramId: number, email: string): Promise<void> {
  await db.query(
    'UPDATE users SET email = $1, updated_at = NOW() WHERE telegram_id = $2',
    [email, telegramId],
  );
}

/** Check if user has active subscription */
export async function hasActiveSubscription(telegramId: number): Promise<boolean> {
  const result = await db.query(
    'SELECT is_subscribed, expires_at FROM users WHERE telegram_id = $1',
    [telegramId],
  );
  const user = result.rows[0];
  if (!user) return false;
  if (!user.is_subscribed) return false;
  if (user.expires_at && new Date(user.expires_at) < new Date()) return false;
  return true;
}

/** Activate subscription and save recToken after successful payment.
 *  If user has remaining days, extends from current expiry (not from now). */
export async function activateSubscription(
  telegramId: number,
  months: number,
  recToken: string | null,
  cardPan: string | null,
): Promise<void> {
  // Check if user has unexpired subscription to extend from
  const existing = await db.query(
    'SELECT expires_at FROM users WHERE telegram_id = $1',
    [telegramId],
  );
  const currentExpiry = existing.rows[0]?.expires_at;
  const now = new Date();

  // Extend from current expiry if it's in the future, otherwise from now
  const baseDate = currentExpiry && new Date(currentExpiry) > now
    ? new Date(currentExpiry)
    : now;

  const expiresAt = new Date(baseDate);
  expiresAt.setMonth(expiresAt.getMonth() + months);

  await db.query(
    `UPDATE users SET
       is_subscribed = TRUE,
       subscribed_at = COALESCE(subscribed_at, NOW()),
       expires_at = $1,
       rec_token = COALESCE($2, rec_token),
       card_pan = COALESCE($3, card_pan),
       updated_at = NOW()
     WHERE telegram_id = $4`,
    [expiresAt, recToken, cardPan, telegramId],
  );
}
