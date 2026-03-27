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
