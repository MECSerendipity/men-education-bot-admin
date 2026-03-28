import { TEXTS } from '../texts/index.js';
import type { PricesSnapshot } from '../services/pricing.js';

/** Main menu keyboard shown after /start */
export const MAIN_MENU_KEYBOARD = {
  keyboard: [
    [{ text: TEXTS.BTN_SUBSCRIPTION }, { text: TEXTS.BTN_MY_SUBSCRIPTION }],
    [{ text: TEXTS.BTN_ACCOUNT }, { text: TEXTS.BTN_SUPPORT }],
  ],
  resize_keyboard: true,
};

/** Format price safely — returns '?' if price key is missing */
function price(prices: PricesSnapshot, key: string): number | string {
  return prices[key]?.amount ?? '?';
}

/** Build inline keyboard: tariff selection with dynamic prices (step 1) */
export function buildTariffKeyboard(prices: PricesSnapshot) {
  return {
    inline_keyboard: [
      [{ text: `🏆 12 місяців — ${price(prices, 'card_12m')} грн / ${price(prices, 'crypto_12m')} USDT`, callback_data: 'tariff:12m' }],
      [{ text: `🎩 6 місяців — ${price(prices, 'card_6m')} грн / ${price(prices, 'crypto_6m')} USDT`, callback_data: 'tariff:6m' }],
      [{ text: `🌂 1 місяць — ${price(prices, 'card_1m')} грн / ${price(prices, 'crypto_1m')} USDT`, callback_data: 'tariff:1m' }],
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
