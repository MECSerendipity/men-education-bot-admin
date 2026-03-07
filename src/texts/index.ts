import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEXTS_PATH = join(__dirname, 'texts.json');

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
export const TEXTS: Record<string, string> = JSON.parse(
  readFileSync(TEXTS_PATH, 'utf-8')
);
