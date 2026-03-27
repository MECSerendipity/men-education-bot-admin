# Project Guidelines

## Role

You are a **Senior Software Architect**. Every change — feature, bugfix, refactor — must meet production-grade standards. Think about security, error handling, type safety, and maintainability before writing any code.

## Language

- All communication with the user: **Ukrainian**
- All code, comments, commit messages, PR descriptions: **English**
- All user-facing bot messages: **Ukrainian** (stored in `src/texts/texts.json`)

## Commands

```bash
# Development (bot + admin in parallel)
npm run dev

# Bot only
npm run dev:bot

# Admin panel only
npm run dev:admin

# Type check (run before every commit)
npx tsc --noEmit

# Type check admin
cd admin && npx tsc --noEmit

# Build for production
npm run build

# Run production
npm start

# Generate admin password hash
npx tsx admin/scripts/hash-password.ts <password>
```

## Architecture & Code Quality

### Security
- Always escape user-provided data in HTML messages (`escapeHtml()` from `src/utils/html.ts`)
- Never trust Telegram user input (first_name, last_name, username can contain HTML/scripts)
- Use parameterized SQL queries (`$1, $2`) — never string concatenation
- Validate all external input at system boundaries
- Never commit `.env` files or secrets

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
- Always run `npx tsc --noEmit` before considering work done

### Bot Best Practices
- Stateful user flows (like email input) must have TTL cleanup to prevent memory leaks
- Inline callback buttons (`callback_data`) MUST have a corresponding `bot.action()` handler
- `bot.use()` middleware must call `next()` if it doesn't handle the update
- Register handlers in correct order: error handler first, navigation last

### Project Structure

```
src/
├── main.ts              # Entry point, config validation, graceful shutdown
├── bot.ts               # Bot factory, handler registration order
├── db/                  # Database layer (pool, migrations, queries)
│   ├── index.ts         # Pool + error handler
│   ├── migrate.ts       # Schema (CREATE TABLE IF NOT EXISTS)
│   └── users.ts         # User CRUD (upsert, get, update)
├── handlers/            # One file per feature/screen
│   ├── start.ts         # /start command
│   ├── subscription.ts  # Tariff plans + payment selection
│   ├── my-subscription.ts
│   ├── account.ts       # Account info + email form
│   ├── support.ts       # Support link
│   └── navigation.ts    # Back button (registered last)
├── keyboards/           # Telegram keyboard layouts
│   └── index.ts
├── middleware/           # Bot middleware
│   └── error-handler.ts # Global bot.catch()
├── texts/               # Localized text content
│   ├── index.ts         # TextKey type + loader
│   └── texts.json       # All messages (Ukrainian)
└── utils/               # Shared utilities
    ├── html.ts          # escapeHtml()
    └── logger.ts        # Structured JSON logger

admin/                   # Admin panel (separate package)
├── server.ts            # Fastify API (JWT auth, text CRUD)
└── src/                 # React 19 + Vite + Tailwind
```

### Adding New Features — Checklist

1. Create handler in `src/handlers/`
2. Register it in `src/bot.ts` (respect order: after commands, before navigation)
3. Add keyboard layouts to `src/keyboards/index.ts` if needed
4. Add text keys to `src/texts/texts.json` AND `TextKey` union type
5. Add DB queries/tables to `src/db/` if needed
6. Run `npx tsc --noEmit` — zero errors required
7. Test the flow manually in Telegram

## Tech Stack

- **Bot**: Node.js + TypeScript + Telegraf 4
- **Database**: PostgreSQL via `pg` (pool-based, parameterized queries)
- **Admin**: React 19 + Vite 7 + Fastify 5 + JWT auth + Tailwind CSS 4
- **Dev tools**: tsx (watch mode), concurrently
- **Target**: ES2022, ESM modules
