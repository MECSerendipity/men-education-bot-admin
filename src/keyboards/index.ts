import { TEXTS } from '../texts/index.js';

/** Main menu keyboard shown after /start */
export const MAIN_MENU_KEYBOARD = {
  keyboard: [
    [{ text: TEXTS.BTN_ABOUT }],
    [{ text: TEXTS.BTN_SUBSCRIPTION }],
    [{ text: TEXTS.BTN_PARTNER }],
    [{ text: TEXTS.BTN_HORMONES }],
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
