import { db } from './index.js';

export interface SubscriptionEvent {
  id: number;
  subscription_id: number;
  telegram_id: number;
  event: string;
  plan: string | null;
  method: string | null;
  card_pan: string | null;
  amount: number | null;
  currency: string | null;
  expires_at: Date | null;
  created_at: Date;
}

/** Log a subscription event */
export async function logSubscriptionEvent(params: {
  subscriptionId: number;
  telegramId: number;
  event: string;
  plan?: string | null;
  method?: string | null;
  cardPan?: string | null;
  amount?: number | null;
  currency?: string | null;
  expiresAt?: Date | null;
}): Promise<void> {
  await db.query(
    `INSERT INTO subscription_events (subscription_id, telegram_id, event, plan, method, card_pan, amount, currency, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      params.subscriptionId,
      params.telegramId,
      params.event,
      params.plan ?? null,
      params.method ?? null,
      params.cardPan ?? null,
      params.amount ?? null,
      params.currency ?? null,
      params.expiresAt ?? null,
    ],
  );
}

/** Get all events for a user (for admin panel) */
export async function getEventsForUser(telegramId: number): Promise<SubscriptionEvent[]> {
  const result = await db.query(
    'SELECT * FROM subscription_events WHERE telegram_id = $1 ORDER BY created_at ASC',
    [telegramId],
  );
  return result.rows;
}

/** Get all events (paginated, for admin panel) */
export async function getEventsPaginated(page: number, limit: number): Promise<{ rows: SubscriptionEvent[]; total: number }> {
  const offset = (page - 1) * limit;
  const [dataResult, countResult] = await Promise.all([
    db.query('SELECT * FROM subscription_events ORDER BY created_at DESC LIMIT $1 OFFSET $2', [limit, offset]),
    db.query('SELECT COUNT(*)::int AS total FROM subscription_events'),
  ]);
  return { rows: dataResult.rows, total: countResult.rows[0].total };
}
