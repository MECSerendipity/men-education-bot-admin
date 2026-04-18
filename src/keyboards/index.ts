import { TEXTS } from '../texts/index.js';
import type { PricesSnapshot } from '../services/pricing.js';

/** Main menu keyboard shown after /start */
export function buildMainMenuKeyboard(isSubscribed: boolean) {
  const rows = isSubscribed
    ? [
        [{ text: TEXTS.BTN_MY_SUBSCRIPTION }],
        [{ text: TEXTS.BTN_SUBSCRIPTION }, { text: TEXTS.BTN_PARTNER }],
        [{ text: TEXTS.BTN_ACCOUNT }, { text: TEXTS.BTN_SUPPORT }],
      ]
    : [
        [{ text: TEXTS.BTN_SUBSCRIPTION }, { text: TEXTS.BTN_MY_SUBSCRIPTION }],
        [{ text: TEXTS.BTN_ACCOUNT }, { text: TEXTS.BTN_SUPPORT }],
      ];
  return { keyboard: rows, resize_keyboard: true };
}


/** Build tariff button text: "🎩 6 місяців — 3850 UAH / 90 USDT" */
function tariffButton(prices: PricesSnapshot, cardKey: string, cryptoKey: string): string {
  const card = prices[cardKey];
  const crypto = prices[cryptoKey];
  const name = card?.display_name ?? crypto?.display_name ?? '?';
  return `${name} — ${card?.amount ?? '?'} ${card?.currency ?? 'UAH'} / ${crypto?.amount ?? '?'} ${crypto?.currency ?? 'USDT'}`;
}

/** Build inline keyboard: tariff selection with dynamic prices (step 1) */
export function buildTariffKeyboard(prices: PricesSnapshot) {
  return {
    inline_keyboard: [
      [{ text: tariffButton(prices, 'card_12m', 'crypto_12m'), callback_data: 'tariff:12m' }],
      [{ text: tariffButton(prices, 'card_6m', 'crypto_6m'), callback_data: 'tariff:6m' }],
      [{ text: tariffButton(prices, 'card_1m', 'crypto_1m'), callback_data: 'tariff:1m' }],
      [{ text: TEXTS.BTN_BACK, callback_data: 'back:main' }],
    ],
  };
}

/** Build inline keyboard: payment method selection (step 2) */
export function paymentMethodKeyboard(duration: string) {
  return {
    inline_keyboard: [
      [{ text: TEXTS.BTN_PAY_CARD, callback_data: `pay:card:${duration}` }],
      [{ text: TEXTS.BTN_PAY_USDT, callback_data: `pay:usdt:${duration}` }],
      [{ text: TEXTS.BTN_BACK_TARIFFS, callback_data: 'back:tariffs' }],
    ],
  };
}

/** Back button keyboard for sub-sections */
export const BACK_KEYBOARD = {
  keyboard: [
    [{ text: TEXTS.BTN_BACK }],
  ],
  resize_keyboard: true,
};
