import { getGlobalPrices, getOffersForUser, type PriceRow } from '../db/prices.js';
import { getActiveSubscription } from '../db/subscriptions.js';

/** Full snapshot of all 6 plan prices */
export type PricesSnapshot = Record<string, PriceRow>;

/**
 * Get prices for a specific user using 3-level resolution:
 * 1. Active subscription → subscription.prices (locked)
 * 2. Price offers → price_offers table
 * 3. Global prices → prices table
 */
export async function getPricesForUser(telegramId: number): Promise<PricesSnapshot> {
  // Level 1: active subscription — locked prices
  const subscription = await getActiveSubscription(telegramId);
  if (subscription?.prices) {
    return subscription.prices as PricesSnapshot;
  }

  // Level 2: individual price offers
  const offers = await getOffersForUser(telegramId);
  if (offers) {
    return offers;
  }

  // Level 3: global prices
  return getGlobalPrices();
}

/** Convert plan key to another method (card_6m → crypto_6m, crypto_1m → card_1m) */
export function switchPlanMethod(planKey: string, newMethod: 'card' | 'crypto'): string {
  const duration = planKey.replace(/^(card|crypto)_/, '');
  return `${newMethod}_${duration}`;
}

/** Extract duration suffix from plan key (card_6m → '6m') */
export function planDuration(planKey: string): string {
  return planKey.replace(/^(card|crypto)_/, '');
}

/** Extract days from plan key (card_1m → 30, crypto_12m → 365) */
export function daysFromPlanKey(planKey: string): number {
  if (planKey.endsWith('12m')) return 365;
  if (planKey.endsWith('6m')) return 180;
  return 30;
}
