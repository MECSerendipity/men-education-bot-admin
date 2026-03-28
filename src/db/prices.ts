import { db } from './index.js';

export interface PriceRow {
  key: string;
  amount: number;
  currency: string;
  days: number;
  label: string;
}

/** Get all global prices as a map keyed by plan key */
export async function getGlobalPrices(): Promise<Record<string, PriceRow>> {
  const result = await db.query('SELECT * FROM prices');
  const map: Record<string, PriceRow> = {};
  for (const row of result.rows) {
    map[row.key] = {
      key: row.key,
      amount: Number(row.amount),
      currency: row.currency,
      days: row.days,
      label: row.label,
    };
  }
  return map;
}

/** Get price offers for a specific user (returns null if none) */
export async function getOffersForUser(telegramId: number): Promise<Record<string, PriceRow> | null> {
  const result = await db.query(
    'SELECT * FROM price_offers WHERE telegram_id = $1',
    [telegramId],
  );
  if (result.rows.length === 0) return null;

  const map: Record<string, PriceRow> = {};
  for (const row of result.rows) {
    map[row.key] = {
      key: row.key,
      amount: Number(row.amount),
      currency: row.currency,
      days: row.days,
      label: row.label,
    };
  }
  return map;
}

/** Delete all price offers for user (called after successful payment) */
export async function deleteOffersForUser(telegramId: number): Promise<void> {
  await db.query('DELETE FROM price_offers WHERE telegram_id = $1', [telegramId]);
}

/** Update a global price (for admin panel) */
export async function updateGlobalPrice(key: string, amount: number): Promise<void> {
  await db.query(
    'UPDATE prices SET amount = $1, updated_at = NOW() WHERE key = $2',
    [amount, key],
  );
}

/** Create or update a price offer for a user (for admin panel) */
export async function upsertOfferForUser(
  telegramId: number,
  key: string,
  amount: number,
  currency: string,
  days: number,
  label: string,
): Promise<void> {
  await db.query(
    `INSERT INTO price_offers (telegram_id, key, amount, currency, days, label)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (telegram_id, key) DO UPDATE SET
       amount = EXCLUDED.amount,
       currency = EXCLUDED.currency,
       days = EXCLUDED.days,
       label = EXCLUDED.label`,
    [telegramId, key, amount, currency, days, label],
  );
}
