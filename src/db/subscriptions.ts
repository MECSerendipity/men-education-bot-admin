import { db } from './index.js';


export interface Subscription {
  id: number;
  user_id: number;
  telegram_id: number;
  plan: string;
  method: string; // card, crypto
  status: string; // Active, Expired
  card_pan: string | null;
  rec_token: string | null;
  prices: Record<string, unknown> | null; // JSONB snapshot of prices at payment time
  started_at: Date;
  expires_at: Date;
  created_at: Date;
  updated_at: Date;
}

/** Check if user has an active subscription (date-level: access for the full expiry day) */
export async function hasActiveSubscription(telegramId: number): Promise<boolean> {
  const result = await db.query(
    `SELECT 1 FROM subscriptions
     WHERE telegram_id = $1
       AND status = 'Active'
       AND expires_at::date >= CURRENT_DATE
     LIMIT 1`,
    [telegramId],
  );
  return result.rows.length > 0;
}

/** Get active subscription for user (date-level: access for the full expiry day) */
export async function getActiveSubscription(telegramId: number): Promise<Subscription | null> {
  const result = await db.query(
    `SELECT * FROM subscriptions
     WHERE telegram_id = $1
       AND status = 'Active'
       AND expires_at::date >= CURRENT_DATE
     ORDER BY expires_at DESC
     LIMIT 1`,
    [telegramId],
  );
  return result.rows[0] ?? null;
}

/** Get cancelled subscription that hasn't expired yet (date-level: access for the full expiry day) */
export async function getCancelledSubscription(telegramId: number): Promise<Subscription | null> {
  const result = await db.query(
    `SELECT * FROM subscriptions
     WHERE telegram_id = $1
       AND status = 'Cancelled'
       AND expires_at::date >= CURRENT_DATE
     ORDER BY expires_at DESC
     LIMIT 1`,
    [telegramId],
  );
  return result.rows[0] ?? null;
}

/** Cancel active subscription — status becomes Cancelled, access until expires_at */
export async function cancelSubscription(telegramId: number): Promise<Subscription | null> {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const result = await client.query(
      `UPDATE subscriptions SET status = 'Cancelled', updated_at = NOW()
       WHERE telegram_id = $1 AND status = 'Active' AND expires_at::date >= CURRENT_DATE
       RETURNING *`,
      [telegramId],
    );
    const sub: Subscription | undefined = result.rows[0];
    if (!sub) { await client.query('ROLLBACK'); return null; }

    // Log cancelled event
    await client.query(
      `INSERT INTO subscription_events (subscription_id, telegram_id, event, plan, method, expires_at)
       VALUES ($1, $2, 'cancelled', $3, $4, $5)`,
      [sub.id, telegramId, sub.plan, sub.method, sub.expires_at],
    );

    await client.query('COMMIT');
    return sub;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Reactivate cancelled subscription — status back to Active */
export async function reactivateSubscription(telegramId: number): Promise<Subscription | null> {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const result = await client.query(
      `UPDATE subscriptions SET status = 'Active', updated_at = NOW()
       WHERE telegram_id = $1 AND status = 'Cancelled' AND expires_at::date >= CURRENT_DATE
       RETURNING *`,
      [telegramId],
    );
    const sub: Subscription | undefined = result.rows[0];
    if (!sub) { await client.query('ROLLBACK'); return null; }

    // Log reactivated event
    await client.query(
      `INSERT INTO subscription_events (subscription_id, telegram_id, event, plan, method, expires_at)
       VALUES ($1, $2, 'reactivated', $3, $4, $5)`,
      [sub.id, telegramId, sub.plan, sub.method, sub.expires_at],
    );

    await client.query('COMMIT');
    return sub;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Switch payment method on active subscription (card ↔ crypto) */
export async function changePaymentMethod(telegramId: number, newMethod: string, newPlan: string, cardPan?: string | null): Promise<Subscription | null> {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const clearCard = newMethod === 'crypto';
    const result = await client.query(
      `UPDATE subscriptions
       SET method = $1, plan = $2,
           rec_token = CASE WHEN $4 THEN NULL ELSE rec_token END,
           card_pan = CASE WHEN $4 THEN NULL ELSE card_pan END,
           updated_at = NOW()
       WHERE telegram_id = $3 AND status = 'Active' AND expires_at::date >= CURRENT_DATE
       RETURNING *`,
      [newMethod, newPlan, telegramId, clearCard],
    );
    const sub: Subscription | undefined = result.rows[0];
    if (!sub) { await client.query('ROLLBACK'); return null; }

    const eventCardPan = cardPan ?? sub.card_pan;
    const eventCurrency = newMethod === 'card' ? 'UAH' : 'USDT';

    const eventAmount = newMethod === 'card' ? 1 : 0;
    await client.query(
      `INSERT INTO subscription_events (subscription_id, telegram_id, event, plan, method, card_pan, amount, currency, expires_at)
       VALUES ($1, $2, 'method_changed', $3, $4, $5, $6, $7, $8)`,
      [sub.id, telegramId, newPlan, newMethod, eventCardPan, eventAmount, eventCurrency, sub.expires_at],
    );

    await client.query('COMMIT');
    return sub;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Change subscription plan (duration only, method stays the same) */
export async function changeSubscriptionPlan(telegramId: number, newPlan: string): Promise<Subscription | null> {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const result = await client.query(
      `UPDATE subscriptions
       SET plan = $1, updated_at = NOW()
       WHERE telegram_id = $2 AND status = 'Active' AND expires_at::date >= CURRENT_DATE
       RETURNING *`,
      [newPlan, telegramId],
    );
    const sub: Subscription | undefined = result.rows[0];
    if (!sub) { await client.query('ROLLBACK'); return null; }

    const prices = sub.prices as Record<string, Record<string, unknown>> | null;
    const planPrice = prices?.[newPlan];
    const amount = Number(planPrice?.amount ?? 0);
    const currency = String(planPrice?.currency ?? '');

    await client.query(
      `INSERT INTO subscription_events (subscription_id, telegram_id, event, plan, method, card_pan, amount, currency, expires_at)
       VALUES ($1, $2, 'plan_changed', $3, $4, $5, $6, $7, $8)`,
      [sub.id, telegramId, newPlan, sub.method, sub.card_pan, amount, currency, sub.expires_at],
    );

    await client.query('COMMIT');
    return sub;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Update card details (recToken + cardPan) on active subscription */
export async function updateSubscriptionCard(telegramId: number, recToken: string, cardPan: string | null): Promise<boolean> {
  const result = await db.query(
    `UPDATE subscriptions SET rec_token = $1, card_pan = $2, updated_at = NOW()
     WHERE telegram_id = $3 AND status = 'Active' AND expires_at::date >= CURRENT_DATE`,
    [recToken, cardPan, telegramId],
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Activate subscription after successful payment.
 * One subscription per user: if active — extend expires_at, otherwise create new.
 * Wrapped in a DB transaction to avoid partial state.
 */
export async function activateSubscription(params: {
  telegramId: number;
  plan: string;
  method: string;
  days: number;
  transactionId: number | null;
  prices: Record<string, unknown>;
  cardPan?: string | null;
  recToken?: string | null;
}): Promise<Subscription> {
  const { telegramId, plan, method, days, transactionId, prices, cardPan, recToken } = params;
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    // Use date-level check (not timestamp) to match charge job logic.
    // Without this, a subscription expiring at 20:16 today wouldn't be found at 20:33
    // — causing a duplicate subscription instead of extending.
    const existingResult = await client.query(
      `SELECT * FROM subscriptions
       WHERE telegram_id = $1 AND status = 'Active' AND expires_at::date >= CURRENT_DATE
       ORDER BY expires_at DESC
       LIMIT 1`,
      [telegramId],
    );
    const existing: Subscription | undefined = existingResult.rows[0];

    let result;

    if (existing) {
      // Extend existing subscription
      result = await client.query(
        `UPDATE subscriptions
         SET expires_at = expires_at + make_interval(days => $1), plan = $2, method = $3,
             prices = $4, card_pan = COALESCE($5, card_pan),
             rec_token = COALESCE($6, rec_token), updated_at = NOW()
         WHERE id = $7
         RETURNING *`,
        [days, plan, method, JSON.stringify(prices), cardPan ?? null, recToken ?? null, existing.id],
      );
    } else {
      // Expire any lingering Active subscriptions before creating new one
      await client.query(
        `UPDATE subscriptions SET status = 'Expired', updated_at = NOW()
         WHERE telegram_id = $1 AND status = 'Active'`,
        [telegramId],
      );

      // Create new subscription
      result = await client.query(
        `INSERT INTO subscriptions (user_id, telegram_id, plan, method, status, prices, card_pan, rec_token, started_at, expires_at)
         VALUES (
           (SELECT id FROM users WHERE telegram_id = $1),
           $1, $2, $3, 'Active', $4, $5, $6, NOW(), NOW() + make_interval(days => $7)
         )
         RETURNING *`,
        [telegramId, plan, method, JSON.stringify(prices), cardPan ?? null, recToken ?? null, days],
      );
    }

    // Link transaction to this subscription
    if (transactionId) {
      await client.query(
        'UPDATE transactions SET subscription_id = $1 WHERE id = $2',
        [result.rows[0].id, transactionId],
      );
    }

    // Mark user as subscribed
    await client.query(
      'UPDATE users SET is_subscribed = TRUE, updated_at = NOW() WHERE telegram_id = $1',
      [telegramId],
    );

    const sub: Subscription = result.rows[0];

    // Log subscription event (within the same transaction)
    await client.query(
      `INSERT INTO subscription_events (subscription_id, telegram_id, event, plan, method, card_pan, amount, currency, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        sub.id,
        telegramId,
        existing ? 'renewed' : 'created',
        plan,
        method,
        sub.card_pan,
        Number((prices[plan] as Record<string, unknown>)?.amount ?? 0),
        String((prices[plan] as Record<string, unknown>)?.currency ?? ''),
        sub.expires_at,
      ],
    );

    await client.query('COMMIT');
    return sub;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}


