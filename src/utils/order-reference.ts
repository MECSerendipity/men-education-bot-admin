/** Generate unique order reference for payments */
export function generateOrderReference(telegramId: number, method: string): string {
  const prefixes: Record<string, string> = {
    crypto: 'ME_USDT',
    cardchange: 'ME_CARD',
    methodchange: 'ME_METHOD',
  };
  const prefix = prefixes[method] ?? 'ME';
  return `${prefix}_${telegramId}_${Date.now()}`;
}
