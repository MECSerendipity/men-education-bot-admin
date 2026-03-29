import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { logger } from '../utils/logger.js';

/** All known text keys used in the bot */
export type TextKey =
  | 'MAIN_MENU'
  | 'BTN_ABOUT'
  | 'BTN_SUBSCRIPTION'
  | 'BTN_SUBSCRIPTION_INLINE'
  | 'BTN_PARTNER'
  | 'BTN_MY_SUBSCRIPTION'
  | 'NO_SUBSCRIPTION'
  | 'BTN_HORMONES'
  | 'BTN_ACCOUNT'
  | 'ACCOUNT_ADD_EMAIL'
  | 'ACCOUNT_EMAIL_PROMPT'
  | 'ACCOUNT_EMAIL_SAVED'
  | 'ACCOUNT_EMAIL_INVALID'
  | 'BTN_SUPPORT'
  | 'SUPPORT'
  | 'TARIFF_TITLE'
  | 'TARIFF_DETAIL_1M'
  | 'TARIFF_DETAIL_6M'
  | 'TARIFF_DETAIL_12M'
  | 'PAYMENT_METHOD_TITLE'
  | 'BTN_PAY_CARD'
  | 'BTN_PAY_USDT'
  | 'BTN_BACK_TARIFFS'
  | 'BTN_USDT_PAID'
  | 'BTN_USDT_CANCEL'
  | 'BTN_HOME'
  | 'BTN_BACK'
  | 'ABOUT';

/**
 * Path to texts.json — resolved from project root (process.cwd()),
 * not from __dirname, so it works both in dev (tsx src/) and
 * production (node dist/) without copying JSON to dist/.
 */
const TEXTS_PATH = join(process.cwd(), 'src', 'texts', 'texts.json');

/** In-memory cache — loaded once at startup, reloaded manually via reloadTexts() */
let cache: Record<TextKey, string> = JSON.parse(
  readFileSync(TEXTS_PATH, 'utf-8'),
);

/**
 * All bot texts. Read from in-memory cache (0ms).
 * Call reloadTexts() to pick up changes from texts.json.
 */
export const TEXTS: Record<TextKey, string> = new Proxy({} as Record<TextKey, string>, {
  get(_target, prop: string) {
    return cache[prop as TextKey];
  },
});

/**
 * Reload texts from texts.json into memory.
 * Called from webhook server when admin clicks "Apply changes".
 */
export function reloadTexts(): void {
  try {
    cache = JSON.parse(readFileSync(TEXTS_PATH, 'utf-8'));
    logger.info('Texts reloaded from file');
  } catch (err) {
    logger.error('Failed to reload texts.json', err);
    throw err;
  }
}
