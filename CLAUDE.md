# Project Guidelines

## Architecture & Code Quality

Every change to this project MUST follow Senior Architect standards:

### Security
- Always escape user-provided data in HTML messages (`escapeHtml()` from `src/utils/html.ts`)
- Never trust Telegram user input (first_name, last_name, username can contain HTML/scripts)
- Use parameterized SQL queries (`$1, $2`) — never string concatenation
- Validate all external input at system boundaries

### Error Handling
- All bot handlers are protected by the global error handler (`src/middleware/error-handler.ts`)
- Always `await` ctx.reply() and other async Telegram API calls
- Wrap async code inside `setTimeout` in try/catch
- Add `.catch()` to fire-and-forget promises (like `ctx.deleteMessage().catch(() => {})`)

### Production Readiness
- Use `logger` from `src/utils/logger.ts` — never bare `console.log`
- File paths must work both in dev (`tsx src/`) and production (`node dist/`) — use `process.cwd()` for data files, not `__dirname`
- Graceful shutdown: close DB pool and stop bot on SIGINT/SIGTERM
- DB pool has error handler to prevent crashes on connection drops

### Type Safety
- All text keys must be added to the `TextKey` union type in `src/texts/index.ts`
- When adding new texts, update both `texts.json` AND the `TextKey` type
- Use strict TypeScript — no `any`, no `as` casts without justification

### Bot Best Practices
- Stateful user flows (like email input) must have TTL cleanup to prevent memory leaks
- Inline callback buttons (`callback_data`) MUST have a corresponding `bot.action()` handler
- `bot.use()` middleware must call `next()` if it doesn't handle the update
- Register handlers in correct order: error handler first, navigation last

### Project Structure
```
src/
├── main.ts              # Entry point, config validation, graceful shutdown
├── bot.ts               # Bot factory, handler registration
├── db/                  # Database layer (pool, migrations, queries)
├── handlers/            # One file per feature/screen
├── keyboards/           # Telegram keyboard layouts
├── middleware/           # Bot middleware (error handler, etc.)
├── texts/               # Localized text content
└── utils/               # Shared utilities (logger, html escape, etc.)
```

### Adding New Features
1. Create handler in `src/handlers/`
2. Register it in `src/bot.ts` (respect order)
3. Add keyboard layouts to `src/keyboards/index.ts`
4. Add text keys to `src/texts/texts.json` AND `TextKey` type
5. Add DB queries to `src/db/` if needed

## Tech Stack
- **Bot**: Node.js + TypeScript + Telegraf 4
- **Database**: PostgreSQL via `pg` (pool-based)
- **Admin**: React 19 + Vite + Fastify + JWT auth
- **Language**: Ukrainian (all user-facing text)
