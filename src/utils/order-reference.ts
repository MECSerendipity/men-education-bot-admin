/** Generate unique order reference for payments */
export function generateOrderReference(telegramId: number, method: string): string {
  const prefix = method === 'crypto' ? 'ME_USDT' : 'ME';
  return `${prefix}_${telegramId}_${Date.now()}`;
}
