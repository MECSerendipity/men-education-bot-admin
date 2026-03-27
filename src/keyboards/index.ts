import { TEXTS } from '../texts/index.js';

/** Main menu keyboard shown after /start */
export const MAIN_MENU_KEYBOARD = {
  keyboard: [
    [{ text: TEXTS.BTN_SUBSCRIPTION }, { text: TEXTS.BTN_MY_SUBSCRIPTION }],
    [{ text: TEXTS.BTN_ACCOUNT }, { text: TEXTS.BTN_SUPPORT }],
  ],
  resize_keyboard: true,
};

/** Payment method selection keyboard */
export const PAYMENT_KEYBOARD = {
  keyboard: [
    [{ text: TEXTS.BTN_PAY_CARD }],
    [{ text: TEXTS.BTN_PAY_USDT }],
    [{ text: TEXTS.BTN_HOME }],
  ],
  resize_keyboard: true,
};

/** Card tariff selection keyboard */
export const CARD_TARIFF_KEYBOARD = {
  keyboard: [
    [{ text: TEXTS.BTN_CARD_1M }],
    [{ text: TEXTS.BTN_CARD_6M }],
    [{ text: TEXTS.BTN_CARD_12M }],
    [{ text: TEXTS.BTN_CHANGE_PAYMENT }],
    [{ text: TEXTS.BTN_HOME }],
  ],
  resize_keyboard: true,
};

/** USDT tariff selection keyboard */
export const USDT_TARIFF_KEYBOARD = {
  keyboard: [
    [{ text: TEXTS.BTN_USDT_1M }],
    [{ text: TEXTS.BTN_USDT_6M }],
    [{ text: TEXTS.BTN_USDT_12M }],
    [{ text: TEXTS.BTN_CHANGE_PAYMENT }],
    [{ text: TEXTS.BTN_HOME }],
  ],
  resize_keyboard: true,
};

/** Back button keyboard for sub-sections */
export const BACK_KEYBOARD = {
  keyboard: [
    [{ text: TEXTS.BTN_BACK }],
  ],
  resize_keyboard: true,
};
