import { db } from './index.js';
import crypto from 'node:crypto';

export interface Referral {
  id: number;
  referrer_id: number;
  referred_id: number;
  status: string; // clicked | active | inactive
  created_at: Date;
  activated_at: Date | null;
  inactive_at: Date | null;
}

export interface PartnerTransaction {
  id: number;
  partner_id: number;
  referred_id: number | null;
  transaction_id: number | null;
  type: string; // earning_first | earning_recurring | withdrawal
  amount: number;
  currency: string;
  percentage: number | null;
  status: string; // completed | pending | approved | rejected
  admin_note: string | null;
  created_at: Date;
}

export interface PartnerConfig {
  first_enabled: boolean;
  first_percent: number;
  recurring_enabled: boolean;
  recurring_percent: number;
  min_withdrawal_uah: number;
  min_withdrawal_usdt: number;
}

/** Generate a unique 8-character alphanumeric ref_code */
function generateRefCode(): string {
  return crypto.randomBytes(6).toString('base64url').slice(0, 8);
}

/** Get or create ref_code for a user */
export async function getOrCreateRefCode(telegramId: number): Promise<string> {
  // Check if user already has a ref_code
  const existing = await db.query(
    'SELECT ref_code FROM users WHERE telegram_id = $1',
    [telegramId],
  );
  if (existing.rows[0]?.ref_code) {
    return existing.rows[0].ref_code;
  }

  // Generate unique code with retry for collision
  for (let i = 0; i < 5; i++) {
    const code = generateRefCode();
    try {
      await db.query(
        'UPDATE users SET ref_code = $1, updated_at = NOW() WHERE telegram_id = $2 AND ref_code IS NULL',
        [code, telegramId],
      );
      const check = await db.query('SELECT ref_code FROM users WHERE telegram_id = $1', [telegramId]);
      return check.rows[0].ref_code;
    } catch {
      // Unique constraint violation — retry with new code
    }
  }
  throw new Error('Failed to generate unique ref_code');
}

/** Find referrer telegram_id by ref_code */
export async function findReferrerByCode(refCode: string): Promise<number | null> {
  const result = await db.query(
    'SELECT telegram_id FROM users WHERE ref_code = $1',
    [refCode],
  );
  return result.rows[0]?.telegram_id ?? null;
}

/** Create a referral record (click) */
export async function createReferral(referrerId: number, referredId: number): Promise<Referral | null> {
  try {
    const result = await db.query(
      `INSERT INTO partner_referrals (referrer_id, referred_id, status)
       VALUES ($1, $2, 'clicked')
       ON CONFLICT (referred_id) DO NOTHING
       RETURNING *`,
      [referrerId, referredId],
    );
    return result.rows[0] ?? null;
  } catch {
    return null;
  }
}

/** Get referral by referred user's telegram_id */
export async function getReferralByReferredId(referredId: number): Promise<Referral | null> {
  const result = await db.query(
    'SELECT * FROM partner_referrals WHERE referred_id = $1',
    [referredId],
  );
  return result.rows[0] ?? null;
}

/** Activate a referral (first payment by referred user) */
export async function activateReferral(referredId: number): Promise<void> {
  await db.query(
    `UPDATE partner_referrals SET status = 'active', activated_at = NOW()
     WHERE referred_id = $1 AND status = 'clicked'`,
    [referredId],
  );
}

/** Mark referral as inactive (referred user was kicked) — breaks commission chain forever */
export async function deactivateReferral(referredId: number): Promise<void> {
  await db.query(
    `UPDATE partner_referrals SET status = 'inactive', inactive_at = NOW()
     WHERE referred_id = $1 AND status IN ('active', 'clicked')`,
    [referredId],
  );
}

/** Get partner stats: clicks, active referrals, inactive, earnings, withdrawals */
export async function getPartnerStats(referrerId: number): Promise<{
  clicks: number;
  active: number;
  inactive: number;
  totalEarnedUah: number;
  totalEarnedUsdt: number;
  totalWithdrawnUah: number;
  totalWithdrawnUsdt: number;
}> {
  const [countsResult, earningsResult, withdrawalsResult] = await Promise.all([
    db.query(
      `SELECT
        COUNT(*) AS clicks,
        COUNT(*) FILTER (WHERE status = 'active') AS active,
        COUNT(*) FILTER (WHERE status = 'inactive') AS inactive
       FROM partner_referrals WHERE referrer_id = $1`,
      [referrerId],
    ),
    db.query(
      `SELECT
        COALESCE(SUM(amount) FILTER (WHERE currency = 'UAH'), 0) AS total_uah,
        COALESCE(SUM(amount) FILTER (WHERE currency = 'USDT'), 0) AS total_usdt
       FROM partner_transactions
       WHERE partner_id = $1 AND type LIKE 'earning_%' AND status = 'completed'`,
      [referrerId],
    ),
    db.query(
      `SELECT
        COALESCE(SUM(amount) FILTER (WHERE currency = 'UAH'), 0) AS total_uah,
        COALESCE(SUM(amount) FILTER (WHERE currency = 'USDT'), 0) AS total_usdt
       FROM partner_transactions
       WHERE partner_id = $1 AND type = 'withdrawal' AND status = 'approved'`,
      [referrerId],
    ),
  ]);

  return {
    clicks: Number(countsResult.rows[0].clicks),
    active: Number(countsResult.rows[0].active),
    inactive: Number(countsResult.rows[0].inactive),
    totalEarnedUah: Number(earningsResult.rows[0].total_uah),
    totalEarnedUsdt: Number(earningsResult.rows[0].total_usdt),
    totalWithdrawnUah: Number(withdrawalsResult.rows[0].total_uah),
    totalWithdrawnUsdt: Number(withdrawalsResult.rows[0].total_usdt),
  };
}

/** Ensure partner_accounts row exists for a user (upsert with 0) */
async function ensurePartnerBalance(client: { query: (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> }, telegramId: number): Promise<void> {
  await client.query(
    `INSERT INTO partner_accounts (telegram_id) VALUES ($1) ON CONFLICT (telegram_id) DO NOTHING`,
    [telegramId],
  );
}

/** Get partner balance */
export async function getPartnerBalance(telegramId: number): Promise<{ uah: number; usdt: number }> {
  const result = await db.query(
    'SELECT balance_uah, balance_usdt FROM partner_accounts WHERE telegram_id = $1',
    [telegramId],
  );
  return {
    uah: Number(result.rows[0]?.balance_uah ?? 0),
    usdt: Number(result.rows[0]?.balance_usdt ?? 0),
  };
}

/** Add earnings to partner balance (atomic). Returns false if commission was already credited for this transaction. */
export async function addPartnerEarning(params: {
  partnerId: number;
  referredId: number;
  transactionId: number;
  type: 'earning_first' | 'earning_recurring';
  amount: number;
  currency: string;
  percentage: number;
}): Promise<boolean> {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    // Record the earning — UNIQUE (transaction_id, type) prevents double-credit.
    // ON CONFLICT DO NOTHING + RETURNING id lets us detect duplicates and skip the balance update.
    const insertResult = await client.query(
      `INSERT INTO partner_transactions (partner_id, referred_id, transaction_id, type, amount, currency, percentage, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'completed')
       ON CONFLICT (transaction_id, type) WHERE type LIKE 'earning_%' DO NOTHING
       RETURNING id`,
      [params.partnerId, params.referredId, params.transactionId, params.type, params.amount, params.currency, params.percentage],
    );

    if (insertResult.rows.length === 0) {
      // Duplicate commission — already credited for this transaction. Don't touch balance.
      await client.query('ROLLBACK');
      return false;
    }

    // Ensure balance row exists and update it
    await ensurePartnerBalance(client, params.partnerId);
    const balanceField = params.currency === 'UAH' ? 'balance_uah' : 'balance_usdt';
    await client.query(
      `UPDATE partner_accounts SET ${balanceField} = ${balanceField} + $1, updated_at = NOW() WHERE telegram_id = $2`,
      [params.amount, params.partnerId],
    );

    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Create a withdrawal request */
export async function createWithdrawalRequest(telegramId: number, amount: number, currency: string): Promise<PartnerTransaction> {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    // Verify balance
    const balanceField = currency === 'UAH' ? 'balance_uah' : 'balance_usdt';
    const balanceResult = await client.query(
      `SELECT ${balanceField} AS balance FROM partner_accounts WHERE telegram_id = $1 FOR UPDATE`,
      [telegramId],
    );
    const balance = Number(balanceResult.rows[0]?.balance ?? 0);
    if (balance < amount) {
      await client.query('ROLLBACK');
      throw new Error('Insufficient balance');
    }

    // Deduct from balance immediately
    await client.query(
      `UPDATE partner_accounts SET ${balanceField} = ${balanceField} - $1, updated_at = NOW() WHERE telegram_id = $2`,
      [amount, telegramId],
    );

    // Create pending withdrawal
    const result = await client.query(
      `INSERT INTO partner_transactions (partner_id, type, amount, currency, status)
       VALUES ($1, 'withdrawal', $2, $3, 'pending')
       RETURNING *`,
      [telegramId, amount, currency],
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

/** Approve or reject withdrawal (admin) */
export async function processWithdrawal(id: number, approved: boolean, adminNote?: string): Promise<boolean> {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const result = await client.query(
      `UPDATE partner_transactions SET status = $1, admin_note = $2
       WHERE id = $3 AND type = 'withdrawal' AND status = 'pending'
       RETURNING *`,
      [approved ? 'approved' : 'rejected', adminNote ?? null, id],
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return false;
    }

    // If rejected, return funds to balance
    if (!approved) {
      const tx = result.rows[0] as PartnerTransaction;
      const balanceField = tx.currency === 'UAH' ? 'balance_uah' : 'balance_usdt';
      await client.query(
        `UPDATE partner_accounts SET ${balanceField} = ${balanceField} + $1, updated_at = NOW() WHERE telegram_id = $2`,
        [tx.amount, tx.partner_id],
      );
    }

    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Get pending withdrawal for a partner (if any) */
export async function getPendingWithdrawal(telegramId: number): Promise<PartnerTransaction | null> {
  const result = await db.query(
    `SELECT * FROM partner_transactions
     WHERE partner_id = $1 AND type = 'withdrawal' AND status = 'pending'
     ORDER BY created_at DESC LIMIT 1`,
    [telegramId],
  );
  return result.rows[0] ?? null;
}

/** Get all partner config as typed object */
export async function getPartnerConfig(): Promise<PartnerConfig> {
  const result = await db.query('SELECT key, value FROM partner_config');
  const configMap: Record<string, string> = {};
  for (const row of result.rows) {
    configMap[row.key] = row.value;
  }
  return {
    first_enabled: configMap.first_enabled === 'true',
    first_percent: Number(configMap.first_percent ?? 77),
    recurring_enabled: configMap.recurring_enabled === 'true',
    recurring_percent: Number(configMap.recurring_percent ?? 10),
    min_withdrawal_uah: Number(configMap.min_withdrawal_uah ?? 100),
    min_withdrawal_usdt: Number(configMap.min_withdrawal_usdt ?? 5),
  };
}

/** Update a partner config value */
export async function updatePartnerConfig(key: string, value: string): Promise<void> {
  await db.query(
    `UPDATE partner_config SET value = $1, updated_at = NOW() WHERE key = $2`,
    [value, key],
  );
}

/** Get referrals list for a partner */
export async function getPartnerReferrals(referrerId: number): Promise<(Referral & { username: string | null; first_name: string | null })[]> {
  const result = await db.query(
    `SELECT r.*, u.username, u.first_name
     FROM partner_referrals r
     LEFT JOIN users u ON u.telegram_id = r.referred_id
     WHERE r.referrer_id = $1
     ORDER BY r.created_at DESC`,
    [referrerId],
  );
  return result.rows;
}
