import { db } from './index.js';

export interface Payment {
  id: number;
  user_id: number;
  telegram_id: number;
  amount: number;
  currency: string;
  method: string;
  plan: string;
  status: string;
  order_reference: string;
  created_at: Date;
}

/** Create a new payment record and return it */
export async function createPayment(params: {
  telegramId: number;
  amount: number;
  currency: string;
  method: string;
  plan: string;
  orderReference: string;
}): Promise<Payment> {
  const result = await db.query(
    `INSERT INTO payments (user_id, telegram_id, amount, currency, method, plan, order_reference)
     VALUES (
       (SELECT id FROM users WHERE telegram_id = $1),
       $1, $2, $3, $4, $5, $6
     )
     RETURNING *`,
    [params.telegramId, params.amount, params.currency, params.method, params.plan, params.orderReference],
  );
  return result.rows[0];
}

/** Find payment by WayForPay order reference */
export async function getPaymentByOrderReference(orderReference: string): Promise<Payment | null> {
  const result = await db.query(
    'SELECT * FROM payments WHERE order_reference = $1',
    [orderReference],
  );
  return result.rows[0] ?? null;
}

/** Update payment status after WayForPay callback */
export async function updatePaymentStatus(orderReference: string, status: string): Promise<void> {
  await db.query(
    'UPDATE payments SET status = $1 WHERE order_reference = $2',
    [status, orderReference],
  );
}
