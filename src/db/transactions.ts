import { db } from './index.js';

export interface Transaction {
  id: number;
  user_id: number;
  telegram_id: number;
  amount: number;
  currency: string;
  method: string; // card, crypto
  plan: string;
  status: string;
  order_reference: string;
  rec_token: string | null;
  card_pan: string | null;
  tx_hash: string | null;
  created_at: Date;
}

/** Create a new transaction record */
export async function createTransaction(params: {
  telegramId: number;
  amount: number;
  currency: string;
  method: string;
  plan: string;
  orderReference: string;
}): Promise<Transaction> {
  const result = await db.query(
    `INSERT INTO transactions (user_id, telegram_id, amount, currency, method, plan, order_reference)
     VALUES (
       (SELECT id FROM users WHERE telegram_id = $1),
       $1, $2, $3, $4, $5, $6
     )
     RETURNING *`,
    [params.telegramId, params.amount, params.currency, params.method, params.plan, params.orderReference],
  );
  return result.rows[0];
}

/** Find transaction by order reference */
export async function getTransactionByOrderReference(orderReference: string): Promise<Transaction | null> {
  const result = await db.query(
    'SELECT * FROM transactions WHERE order_reference = $1',
    [orderReference],
  );
  return result.rows[0] ?? null;
}

/** Update transaction status */
export async function updateTransactionStatus(orderReference: string, status: string): Promise<void> {
  await db.query(
    'UPDATE transactions SET status = $1 WHERE order_reference = $2',
    [status, orderReference],
  );
}

/**
 * Atomically claim a transaction for processing: updates status only if it
 * currently matches `expectedStatus`. Returns true if the row was updated
 * (i.e. this caller "won" the race), false otherwise.
 */
export async function claimTransaction(orderReference: string, expectedStatus: string, newStatus: string): Promise<boolean> {
  const result = await db.query(
    'UPDATE transactions SET status = $1 WHERE order_reference = $2 AND status = $3',
    [newStatus, orderReference, expectedStatus],
  );
  return (result.rowCount ?? 0) > 0;
}

/** Save transaction hash for crypto payment */
export async function updateTransactionTxHash(orderReference: string, txHash: string): Promise<void> {
  await db.query(
    'UPDATE transactions SET tx_hash = $1 WHERE order_reference = $2',
    [txHash, orderReference],
  );
}

/** Save rec_token and card_pan after successful card payment */
export async function updateTransactionCard(orderReference: string, recToken: string | null, cardPan: string | null): Promise<void> {
  await db.query(
    'UPDATE transactions SET rec_token = $1, card_pan = $2 WHERE order_reference = $3',
    [recToken, cardPan, orderReference],
  );
}

/** Check if user has a pending crypto transaction */
export async function hasPendingCryptoTransaction(telegramId: number): Promise<boolean> {
  const result = await db.query(
    `SELECT 1 FROM transactions
     WHERE telegram_id = $1
       AND method = 'crypto'
       AND status IN ('Pending', 'WaitingConfirmation')
     LIMIT 1`,
    [telegramId],
  );
  return result.rows.length > 0;
}

/** Check if user has a pending card transaction (created in last 15 min) */
export async function hasPendingCardTransaction(telegramId: number): Promise<boolean> {
  const result = await db.query(
    `SELECT 1 FROM transactions
     WHERE telegram_id = $1
       AND method = 'card'
       AND status = 'Pending'
       AND created_at > NOW() - INTERVAL '15 minutes'
     LIMIT 1`,
    [telegramId],
  );
  return result.rows.length > 0;
}
