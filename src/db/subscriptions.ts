import { db } from './index.js';

export interface Subscription {
  id: number;
  user_id: number;
  telegram_id: number;
  plan: string;
  type: string; // card, crypto
  status: string; // active, expired
  prices: Record<string, unknown> | null; // JSONB snapshot of prices at payment time
  started_at: Date;
  expires_at: Date;
  transaction_id: number | null;
  created_at: Date;
  updated_at: Date;
}

/** Check if user has an active subscription */
export async function hasActiveSubscription(telegramId: number): Promise<boolean> {
  const result = await db.query(
    `SELECT 1 FROM subscriptions
     WHERE telegram_id = $1
       AND status = 'Active'
       AND expires_at > NOW()
     LIMIT 1`,
    [telegramId],
  );
  return result.rows.length > 0;
}

/** Get active subscription for user */
export async function getActiveSubscription(telegramId: number): Promise<Subscription | null> {
  const result = await db.query(
    `SELECT * FROM subscriptions
     WHERE telegram_id = $1
       AND status = 'Active'
       AND expires_at > NOW()
     LIMIT 1`,
    [telegramId],
  );
  return result.rows[0] ?? null;
}

/**
 * Activate subscription after successful payment.
 * One subscription per user: if active — extend expires_at, otherwise create new.
 * Wrapped in a DB transaction to avoid partial state.
 */
export async function activateSubscription(
  telegramId: number,
  plan: string,
  type: string,
  days: number,
  transactionId: number | null,
  prices: Record<string, unknown>,
): Promise<Subscription> {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const existingResult = await client.query(
      `SELECT * FROM subscriptions
       WHERE telegram_id = $1 AND status = 'Active' AND expires_at > NOW()
       LIMIT 1`,
      [telegramId],
    );
    const existing: Subscription | undefined = existingResult.rows[0];
    const now = new Date();

    let result;

    if (existing) {
      // Extend existing subscription
      const baseDate = new Date(existing.expires_at);
      const expiresAt = new Date(baseDate);
      expiresAt.setDate(expiresAt.getDate() + days);

      result = await client.query(
        `UPDATE subscriptions
         SET expires_at = $1, plan = $2, type = $3,
             prices = $4, transaction_id = $5, updated_at = NOW()
         WHERE id = $6
         RETURNING *`,
        [expiresAt, plan, type, JSON.stringify(prices), transactionId, existing.id],
      );
    } else {
      // Create new subscription
      const expiresAt = new Date(now);
      expiresAt.setDate(expiresAt.getDate() + days);

      result = await client.query(
        `INSERT INTO subscriptions (user_id, telegram_id, plan, type, status, prices, started_at, expires_at, transaction_id)
         VALUES (
           (SELECT id FROM users WHERE telegram_id = $1),
           $1, $2, $3, 'Active', $4, NOW(), $5, $6
         )
         RETURNING *`,
        [telegramId, plan, type, JSON.stringify(prices), expiresAt, transactionId],
      );
    }

    // Mark user as subscribed
    await client.query(
      'UPDATE users SET is_subscribed = TRUE, updated_at = NOW() WHERE telegram_id = $1',
      [telegramId],
    );

    await client.query('COMMIT');
    return result.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Expire subscriptions that are past their expires_at (for jobs) */
export async function expireOverdueSubscriptions(): Promise<number> {
  const result = await db.query(
    `WITH expired AS (
       UPDATE subscriptions
       SET status = 'Expired', updated_at = NOW()
       WHERE status = 'Active' AND expires_at < NOW()
       RETURNING telegram_id
     )
     UPDATE users SET is_subscribed = FALSE, updated_at = NOW()
     WHERE telegram_id IN (SELECT telegram_id FROM expired)
     RETURNING telegram_id`,
  );

  return result.rowCount ?? 0;
}

