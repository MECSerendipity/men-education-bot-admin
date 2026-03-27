import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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
  | 'BTN_PAY_CARD'
  | 'BTN_PAY_USDT'
  | 'PAY_CARD'
  | 'PAY_USDT'
  | 'BTN_CARD_1M'
  | 'BTN_CARD_6M'
  | 'BTN_CARD_12M'
  | 'BTN_USDT_1M'
  | 'BTN_USDT_6M'
  | 'BTN_USDT_12M'
  | 'BTN_CHANGE_PAYMENT'
  | 'BTN_HOME'
  | 'BTN_BACK'
  | 'ABOUT';

/**
 * Path to texts.json — resolved from project root (process.cwd()),
 * not from __dirname, so it works both in dev (tsx src/) and
 * production (node dist/) without copying JSON to dist/.
 */
const TEXTS_PATH = join(process.cwd(), 'src', 'texts', 'texts.json');

/**
 * All bot message texts loaded from texts.json.
 *
 * Current approach: texts are loaded once at startup from a JSON file.
 * The admin panel can edit this file, and `tsx watch` will restart the bot
 * to pick up changes automatically.
 *
 * TODO: When we migrate to PostgreSQL, replace this with a TextService that:
 * 1. Loads all texts from DB into an in-memory Map on bot startup
 * 2. Serves texts from memory (0ms, no DB queries per message)
 * 3. Exposes a refreshTexts() method called via API when admin edits a text
 * 4. This way the bot never queries DB per user message — only on cache refresh
 */
export const TEXTS: Record<TextKey, string> = JSON.parse(
  readFileSync(TEXTS_PATH, 'utf-8'),
);
