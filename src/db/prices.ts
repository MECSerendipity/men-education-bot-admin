import { db } from './index.js';

export interface PriceRow {
  key: string;
  display_name: string;
  amount: number;
  currency: string;
  days: number;
}

/** Get all global prices as a map keyed by plan key */
export async function getGlobalPrices(): Promise<Record<string, PriceRow>> {
  const result = await db.query('SELECT * FROM prices');
  const map: Record<string, PriceRow> = {};
  for (const row of result.rows) {
    map[row.key] = {
      key: row.key,
      display_name: row.display_name,
      amount: Number(row.amount),
      currency: row.currency,
      days: row.days,
    };
  }
  return map;
}

/** Get price offers for a specific user (returns null if none) */
export async function getOffersForUser(telegramId: number): Promise<Record<string, PriceRow> | null> {
  const result = await db.query(
    'SELECT prices FROM price_offers WHERE telegram_id = $1',
    [telegramId],
  );
  if (result.rows.length === 0) return null;
  return result.rows[0].prices as Record<string, PriceRow>;
}

/** Save price offers for a user (full snapshot) */
export async function saveOffersForUser(telegramId: number, prices: Record<string, PriceRow>): Promise<void> {
  await db.query(
    `INSERT INTO price_offers (telegram_id, prices)
     VALUES ($1, $2)
     ON CONFLICT (telegram_id) DO UPDATE SET
       prices = EXCLUDED.prices,
       updated_at = NOW()`,
    [telegramId, JSON.stringify(prices)],
  );
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

/** Update display_name for a global price (for admin panel) */
export async function updateGlobalDisplayName(key: string, displayName: string): Promise<void> {
  await db.query(
    'UPDATE prices SET display_name = $1, updated_at = NOW() WHERE key = $2',
    [displayName, key],
  );
}
