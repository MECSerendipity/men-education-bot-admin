import Fastify, { type FastifyRequest, type FastifyReply } from 'fastify';
import fastifyJwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import bcrypt from 'bcryptjs';
import { config } from 'dotenv';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, writeFile } from 'node:fs/promises';
import pg from 'pg';

/* ---------- Configuration ---------- */

// Load .env from project root (one level up from admin/)
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '..', '.env') });

const ADMIN_LOGIN = process.env.ADMIN_LOGIN;
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH;
const JWT_SECRET = process.env.JWT_SECRET;
const PORT = Number(process.env.ADMIN_PORT) || 3001;

if (!ADMIN_LOGIN || !ADMIN_PASSWORD_HASH || !JWT_SECRET) {
  console.error('❌ Add ADMIN_LOGIN, ADMIN_PASSWORD_HASH and JWT_SECRET to .env');
  console.error('   Run: npm run hash-password to generate a password hash');
  process.exit(1);
}

/* ---------- Server instance ---------- */

const app = Fastify({ logger: true });

// Security headers (XSS, clickjacking, content-type sniffing protection)
await app.register(helmet);

// CORS — allow localhost in dev, or custom origin via ADMIN_CORS_ORIGIN in production
const corsOrigins = process.env.ADMIN_CORS_ORIGIN
  ? [process.env.ADMIN_CORS_ORIGIN]
  : ['http://localhost:5173', 'http://localhost:3001', 'http://127.0.0.1:5173', 'http://127.0.0.1:3001'];

await app.register(cors, { origin: corsOrigins });

// Global rate limit — 100 requests per minute per IP
await app.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute',
});

// JWT plugin for token creation and verification
await app.register(fastifyJwt, { secret: JWT_SECRET });

/* ---------- Auth middleware ---------- */

/** Verifies JWT token from the Authorization header */
async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify();
  } catch {
    return reply.status(401).send({ error: 'Unauthorized' });
  }
}

/* ---------- Routes ---------- */

/** POST /api/auth/login — admin login (stricter rate limit: 5 attempts per minute) */
app.post<{ Body: { login: string; password: string } }>(
  '/api/auth/login',
  {
    config: {
      rateLimit: {
        max: 5,
        timeWindow: '1 minute',
      },
    },
  },
  async (request, reply) => {
    const { login, password } = request.body ?? {};
    if (!login || !password) {
      return reply.status(400).send({ error: 'Login and password are required' });
    }

    // Constant-time comparison via bcrypt prevents timing attacks
    const isValidPassword = await bcrypt.compare(password, ADMIN_PASSWORD_HASH);

    if (login === ADMIN_LOGIN && isValidPassword) {
      const token = app.jwt.sign({ login }, { expiresIn: '24h' });
      return { token };
    }

    return reply.status(401).send({ error: 'Invalid credentials' });
  }
);

/** GET /api/auth/me — verify token validity */
app.get(
  '/api/auth/me',
  { preHandler: [authenticate] },
  async (request) => {
    return { user: request.user };
  }
);

/* ---------- Database ---------- */

const dbPool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

/* ---------- Users API ---------- */

/** GET /api/users — paginated user list with search and subscription filter */
app.get<{
  Querystring: { page?: string; limit?: string; search?: string; filter?: string };
}>(
  '/api/users',
  { preHandler: [authenticate] },
  async (request, reply) => {
    try {
      const page = Math.max(1, Number(request.query.page) || 1);
      const limit = Math.min(100, Math.max(1, Number(request.query.limit) || 20));
      const offset = (page - 1) * limit;
      const searchRaw = (request.query.search ?? '').trim();
      // Escape ILIKE wildcards so user input like % or _ is treated literally
      const search = searchRaw.replace(/[%_\\]/g, '\\$&');
      const filter = request.query.filter ?? 'all'; // all | active | inactive

      const conditions: string[] = [];
      const params: unknown[] = [];
      let paramIndex = 1;

      // Search by username, first_name, last_name, telegram_id or id (all CONTAINS)
      if (search) {
        conditions.push(
          `(u.id::text ILIKE $${paramIndex} OR u.telegram_id::text ILIKE $${paramIndex} OR u.username ILIKE $${paramIndex} OR u.first_name ILIKE $${paramIndex} OR u.last_name ILIKE $${paramIndex} OR u.email ILIKE $${paramIndex})`
        );
        params.push(`%${search}%`);
        paramIndex += 1;
      }

      // Subscription filter
      if (filter === 'active') {
        conditions.push(`u.is_subscribed = TRUE`);
      } else if (filter === 'inactive') {
        conditions.push(`u.is_subscribed = FALSE`);
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      // Count total + counts per filter (for tab badges)
      const countResult = await dbPool.query(
        `SELECT COUNT(*) FROM users u ${where}`,
        params,
      );
      const total = Number(countResult.rows[0].count);

      // Search-only conditions (without subscription filter) for tab counts
      const searchConditions: string[] = [];
      const searchParams: unknown[] = [];
      if (search) {
        searchConditions.push(
          `(u.id::text ILIKE $1 OR u.telegram_id::text ILIKE $1 OR u.username ILIKE $1 OR u.first_name ILIKE $1 OR u.last_name ILIKE $1 OR u.email ILIKE $1)`
        );
        searchParams.push(`%${search}%`);
      }
      const searchWhere = searchConditions.length > 0 ? `WHERE ${searchConditions.join(' AND ')}` : '';

      const countsResult = await dbPool.query(
        `SELECT
           COUNT(*) AS total_all,
           COUNT(*) FILTER (WHERE u.is_subscribed = TRUE) AS total_active,
           COUNT(*) FILTER (WHERE u.is_subscribed = FALSE) AS total_inactive
         FROM users u ${searchWhere}`,
        searchParams,
      );
      const counts = {
        all: Number(countsResult.rows[0].total_all),
        active: Number(countsResult.rows[0].total_active),
        inactive: Number(countsResult.rows[0].total_inactive),
      };

      // Fetch page with subscription data via LEFT JOIN
      const dataResult = await dbPool.query(
        `SELECT u.id, u.telegram_id, u.username, u.first_name, u.last_name, u.email,
                u.is_subscribed, u.created_at,
                s.started_at AS subscribed_at, s.expires_at
         FROM users u
         LEFT JOIN subscriptions s ON s.telegram_id = u.telegram_id AND s.status = 'Active'
         ${where}
         ORDER BY u.created_at DESC
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...params, limit, offset],
      );

      return {
        users: dataResult.rows,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        counts,
      };
    } catch (err) {
      app.log.error(err, 'Failed to fetch users');
      return reply.status(500).send({ error: 'Failed to load users' });
    }
  }
);

/* ---------- Prices API ---------- */

/** GET /api/prices — all global prices */
app.get(
  '/api/prices',
  { preHandler: [authenticate] },
  async (_request, reply) => {
    try {
      const result = await dbPool.query('SELECT * FROM prices ORDER BY key');
      return result.rows;
    } catch (err) {
      app.log.error(err, 'Failed to fetch prices');
      return reply.status(500).send({ error: 'Failed to load prices' });
    }
  }
);

/** PUT /api/prices/:key — update a global price (amount and/or display_name) */
app.put<{ Params: { key: string }; Body: { amount?: number; display_name?: string } }>(
  '/api/prices/:key',
  { preHandler: [authenticate] },
  async (request, reply) => {
    try {
      const { key } = request.params;
      const body = request.body as { amount?: number; display_name?: string };

      const updates: string[] = [];
      const params: unknown[] = [];
      let paramIndex = 1;

      if (typeof body.amount === 'number') {
        if (body.amount <= 0) return reply.status(400).send({ error: 'Amount must be a positive number' });
        updates.push(`amount = $${paramIndex++}`);
        params.push(body.amount);
      }
      if (typeof body.display_name === 'string') {
        if (!body.display_name.trim()) return reply.status(400).send({ error: 'Display name cannot be empty' });
        updates.push(`display_name = $${paramIndex++}`);
        params.push(body.display_name.trim());
      }

      if (updates.length === 0) return reply.status(400).send({ error: 'Nothing to update' });

      updates.push('updated_at = NOW()');
      params.push(key);

      const result = await dbPool.query(
        `UPDATE prices SET ${updates.join(', ')} WHERE key = $${paramIndex} RETURNING *`,
        params,
      );
      if (result.rows.length === 0) {
        return reply.status(404).send({ error: 'Price not found' });
      }
      return result.rows[0];
    } catch (err) {
      app.log.error(err, 'Failed to update price');
      return reply.status(500).send({ error: 'Failed to save price' });
    }
  }
);

/** GET /api/prices/offers — all price offer snapshots */
app.get(
  '/api/prices/offers',
  { preHandler: [authenticate] },
  async (_request, reply) => {
    try {
      const result = await dbPool.query('SELECT * FROM price_offers ORDER BY telegram_id');
      return result.rows;
    } catch (err) {
      app.log.error(err, 'Failed to fetch offers');
      return reply.status(500).send({ error: 'Failed to load offers' });
    }
  }
);

/** POST /api/prices/offers — create offer snapshot for a user (copies global prices as JSONB) */
app.post<{ Body: { telegram_id: string } }>(
  '/api/prices/offers',
  { preHandler: [authenticate] },
  async (request, reply) => {
    try {
      const { telegram_id } = request.body;
      if (!telegram_id) {
        return reply.status(400).send({ error: 'telegram_id is required' });
      }

      // Check if offers already exist
      const existing = await dbPool.query(
        'SELECT 1 FROM price_offers WHERE telegram_id = $1 LIMIT 1',
        [telegram_id],
      );
      if (existing.rows.length > 0) {
        return reply.status(409).send({ error: 'Offers already exist for this user' });
      }

      // Build JSONB snapshot from global prices
      const pricesResult = await dbPool.query('SELECT key, display_name, amount, currency, days FROM prices');
      const snapshot: Record<string, unknown> = {};
      for (const row of pricesResult.rows) {
        snapshot[row.key] = {
          key: row.key,
          display_name: row.display_name,
          amount: Number(row.amount),
          currency: row.currency,
          days: row.days,
        };
      }

      await dbPool.query(
        `INSERT INTO price_offers (telegram_id, prices) VALUES ($1, $2)`,
        [telegram_id, JSON.stringify(snapshot)],
      );

      return { success: true };
    } catch (err) {
      app.log.error(err, 'Failed to create offers');
      return reply.status(500).send({ error: 'Failed to create offers' });
    }
  }
);

/** PUT /api/prices/offers/:telegramId — update a price key within the JSONB snapshot */
app.put<{ Params: { telegramId: string }; Body: { key: string; amount: number } }>(
  '/api/prices/offers/:telegramId',
  { preHandler: [authenticate] },
  async (request, reply) => {
    try {
      const { telegramId } = request.params;
      const { key, amount } = request.body as { key?: string; amount?: number };
      if (!key || typeof amount !== 'number' || amount <= 0) {
        return reply.status(400).send({ error: 'key and positive amount are required' });
      }
      // Update single key inside JSONB: prices->'card_1m'->'amount'
      const result = await dbPool.query(
        `UPDATE price_offers
         SET prices = jsonb_set(prices, ARRAY[$1, 'amount'], to_jsonb($2::numeric)),
             updated_at = NOW()
         WHERE telegram_id = $3
         RETURNING *`,
        [key, amount, telegramId],
      );
      if (result.rows.length === 0) {
        return reply.status(404).send({ error: 'Offer not found' });
      }
      return result.rows[0];
    } catch (err) {
      app.log.error(err, 'Failed to update offer');
      return reply.status(500).send({ error: 'Failed to save offer' });
    }
  }
);

/** DELETE /api/prices/offers/user/:telegramId — delete all offers for a user */
app.delete<{ Params: { telegramId: string } }>(
  '/api/prices/offers/user/:telegramId',
  { preHandler: [authenticate] },
  async (request, reply) => {
    try {
      await dbPool.query('DELETE FROM price_offers WHERE telegram_id = $1', [request.params.telegramId]);
      return { success: true };
    } catch (err) {
      app.log.error(err, 'Failed to delete offers');
      return reply.status(500).send({ error: 'Failed to delete offers' });
    }
  }
);

/* ---------- Subscriptions API ---------- */

/** GET /api/subscriptions — paginated subscription list with search and status filter */
app.get<{
  Querystring: { page?: string; limit?: string; search?: string; filter?: string };
}>(
  '/api/subscriptions',
  { preHandler: [authenticate] },
  async (request, reply) => {
    try {
      const page = Math.max(1, Number(request.query.page) || 1);
      const limit = Math.min(100, Math.max(1, Number(request.query.limit) || 20));
      const offset = (page - 1) * limit;
      const searchRaw = (request.query.search ?? '').trim();
      const search = searchRaw.replace(/[%_\\]/g, '\\$&');
      const filter = request.query.filter ?? 'all'; // all | Active | Expired | Cancelled

      const conditions: string[] = [];
      const params: unknown[] = [];
      let paramIndex = 1;

      if (search) {
        conditions.push(
          `(s.telegram_id::text ILIKE $${paramIndex} OR u.username ILIKE $${paramIndex} OR u.first_name ILIKE $${paramIndex} OR u.last_name ILIKE $${paramIndex})`
        );
        params.push(`%${search}%`);
        paramIndex += 1;
      }

      if (filter !== 'all') {
        conditions.push(`s.status = $${paramIndex}`);
        params.push(filter);
        paramIndex += 1;
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      // Counts per status (with search applied)
      const searchConditions: string[] = [];
      const searchParams: unknown[] = [];
      if (search) {
        searchConditions.push(
          `(s.telegram_id::text ILIKE $1 OR u.username ILIKE $1 OR u.first_name ILIKE $1 OR u.last_name ILIKE $1)`
        );
        searchParams.push(`%${search}%`);
      }
      const searchWhere = searchConditions.length > 0 ? `WHERE ${searchConditions.join(' AND ')}` : '';

      const countsResult = await dbPool.query(
        `SELECT
           COUNT(*) AS total_all,
           COUNT(*) FILTER (WHERE s.status = 'Active') AS total_active,
           COUNT(*) FILTER (WHERE s.status = 'Expired') AS total_expired,
           COUNT(*) FILTER (WHERE s.status = 'Cancelled') AS total_cancelled
         FROM subscriptions s
         LEFT JOIN users u ON u.telegram_id = s.telegram_id
         ${searchWhere}`,
        searchParams,
      );
      const counts = {
        all: Number(countsResult.rows[0].total_all),
        Active: Number(countsResult.rows[0].total_active),
        Expired: Number(countsResult.rows[0].total_expired),
        Cancelled: Number(countsResult.rows[0].total_cancelled),
      };

      const countResult = await dbPool.query(
        `SELECT COUNT(*) FROM subscriptions s LEFT JOIN users u ON u.telegram_id = s.telegram_id ${where}`,
        params,
      );
      const total = Number(countResult.rows[0].count);

      const dataResult = await dbPool.query(
        `SELECT s.id, s.telegram_id, s.plan, s.method, s.status,
                s.card_pan, s.started_at, s.expires_at, s.created_at,
                u.username, u.first_name, u.last_name
         FROM subscriptions s
         LEFT JOIN users u ON u.telegram_id = s.telegram_id
         ${where}
         ORDER BY s.created_at DESC
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...params, limit, offset],
      );

      return {
        subscriptions: dataResult.rows,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        counts,
      };
    } catch (err) {
      app.log.error(err, 'Failed to fetch subscriptions');
      return reply.status(500).send({ error: 'Failed to load subscriptions' });
    }
  }
);

/** GET /api/subscriptions/:telegramId/events — subscription event history for a user */
app.get<{
  Params: { telegramId: string };
}>(
  '/api/subscriptions/:telegramId/events',
  { preHandler: [authenticate] },
  async (request, reply) => {
    try {
      const telegramId = request.params.telegramId;
      const result = await dbPool.query(
        `SELECT * FROM subscription_events
         WHERE telegram_id = $1
         ORDER BY created_at DESC`,
        [telegramId],
      );
      return { events: result.rows };
    } catch (err) {
      app.log.error(err, 'Failed to fetch subscription events');
      return reply.status(500).send({ error: 'Failed to load events' });
    }
  }
);

/* ---------- Transactions API ---------- */

/** GET /api/transactions — paginated transaction list with search and status filter */
app.get<{
  Querystring: { page?: string; limit?: string; search?: string; filter?: string };
}>(
  '/api/transactions',
  { preHandler: [authenticate] },
  async (request, reply) => {
    try {
      const page = Math.max(1, Number(request.query.page) || 1);
      const limit = Math.min(100, Math.max(1, Number(request.query.limit) || 20));
      const offset = (page - 1) * limit;
      const searchRaw = (request.query.search ?? '').trim();
      const search = searchRaw.replace(/[%_\\]/g, '\\$&');
      const filter = request.query.filter ?? 'all';

      const conditions: string[] = [];
      const params: unknown[] = [];
      let paramIndex = 1;

      if (search) {
        conditions.push(
          `(t.telegram_id::text ILIKE $${paramIndex} OR t.order_reference ILIKE $${paramIndex} OR t.tx_hash ILIKE $${paramIndex} OR u.username ILIKE $${paramIndex} OR u.first_name ILIKE $${paramIndex})`
        );
        params.push(`%${search}%`);
        paramIndex += 1;
      }

      if (filter !== 'all') {
        conditions.push(`t.status = $${paramIndex}`);
        params.push(filter);
        paramIndex += 1;
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      // Counts per status (with search applied)
      const searchConditions: string[] = [];
      const searchParams: unknown[] = [];
      if (search) {
        searchConditions.push(
          `(t.telegram_id::text ILIKE $1 OR t.order_reference ILIKE $1 OR t.tx_hash ILIKE $1 OR u.username ILIKE $1 OR u.first_name ILIKE $1)`
        );
        searchParams.push(`%${search}%`);
      }
      const searchWhere = searchConditions.length > 0 ? `WHERE ${searchConditions.join(' AND ')}` : '';

      const countsResult = await dbPool.query(
        `SELECT
           COUNT(*) AS total_all,
           COUNT(*) FILTER (WHERE t.status = 'Approved') AS total_approved,
           COUNT(*) FILTER (WHERE t.status = 'Pending') AS total_pending,
           COUNT(*) FILTER (WHERE t.status = 'Declined') AS total_declined,
           COUNT(*) FILTER (WHERE t.status = 'WaitingConfirmation') AS total_waiting,
           COUNT(*) FILTER (WHERE t.status NOT IN ('Approved', 'Pending', 'Declined', 'WaitingConfirmation')) AS total_other
         FROM transactions t
         LEFT JOIN users u ON u.telegram_id = t.telegram_id
         ${searchWhere}`,
        searchParams,
      );
      const counts = {
        all: Number(countsResult.rows[0].total_all),
        Approved: Number(countsResult.rows[0].total_approved),
        Pending: Number(countsResult.rows[0].total_pending),
        Declined: Number(countsResult.rows[0].total_declined),
        WaitingConfirmation: Number(countsResult.rows[0].total_waiting),
        other: Number(countsResult.rows[0].total_other),
      };

      const countResult = await dbPool.query(
        `SELECT COUNT(*) FROM transactions t LEFT JOIN users u ON u.telegram_id = t.telegram_id ${where}`,
        params,
      );
      const total = Number(countResult.rows[0].count);

      const dataResult = await dbPool.query(
        `SELECT t.id, t.telegram_id, t.amount, t.currency, t.method, t.plan,
                t.status, t.order_reference, t.card_pan, t.tx_hash, t.created_at,
                u.username, u.first_name, u.last_name
         FROM transactions t
         LEFT JOIN users u ON u.telegram_id = t.telegram_id
         ${where}
         ORDER BY t.created_at DESC
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...params, limit, offset],
      );

      return {
        transactions: dataResult.rows,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        counts,
      };
    } catch (err) {
      app.log.error(err, 'Failed to fetch transactions');
      return reply.status(500).send({ error: 'Failed to load transactions' });
    }
  }
);

/* ---------- Texts API ---------- */

/** Path to bot texts JSON file */
const TEXTS_FILE = join(__dirname, '..', 'src', 'texts', 'texts.json');

/** Read all texts from the JSON file */
async function loadTexts(): Promise<Record<string, string>> {
  const content = await readFile(TEXTS_FILE, 'utf-8');
  return JSON.parse(content);
}

/** GET /api/texts — returns all bot texts as key-value pairs */
app.get(
  '/api/texts',
  { preHandler: [authenticate] },
  async (_request, reply) => {
    try {
      const textsMap = await loadTexts();
      const texts = Object.entries(textsMap).map(([key, value]) => ({ key, value }));
      return texts;
    } catch (err) {
      app.log.error(err, 'Failed to read texts file');
      return reply.status(500).send({ error: 'Failed to load texts' });
    }
  }
);

/** PUT /api/texts/:key — update a single text value */
app.put<{ Params: { key: string }; Body: { value: string } }>(
  '/api/texts/:key',
  { preHandler: [authenticate] },
  async (request, reply) => {
    try {
      const { key } = request.params;
      const value = (request.body as { value?: string })?.value;

      if (typeof value !== 'string') {
        return reply.status(400).send({ error: 'Value must be a string' });
      }

      const textsMap = await loadTexts();

      if (!(key in textsMap)) {
        return reply.status(404).send({ error: `Text key "${key}" not found` });
      }

      textsMap[key] = value;
      await writeFile(TEXTS_FILE, JSON.stringify(textsMap, null, 2) + '\n', 'utf-8');

      return { key, value };
    } catch (err) {
      app.log.error(err, 'Failed to update text');
      return reply.status(500).send({ error: 'Failed to save text' });
    }
  }
);

/** POST /api/texts/apply — tell the bot to reload texts from file */
app.post(
  '/api/texts/apply',
  { preHandler: [authenticate] },
  async (_request, reply) => {
    const botWebhookPort = process.env.WEBHOOK_PORT ?? '3001';
    try {
      const res = await fetch(`http://127.0.0.1:${botWebhookPort}/internal/reload-texts`, {
        method: 'POST',
      });
      if (!res.ok) {
        return reply.status(502).send({ error: 'Bot failed to reload texts' });
      }
      return { success: true };
    } catch (err) {
      app.log.error(err, 'Failed to reach bot for text reload');
      return reply.status(502).send({ error: 'Cannot reach bot server' });
    }
  }
);

/* ---------- Logs API ---------- */

/** GET /api/logs/activity — user activity logs with search and filter */
app.get<{
  Querystring: { page?: string; limit?: string; search?: string; filter?: string };
}>(
  '/api/logs/activity',
  { preHandler: [authenticate] },
  async (request, reply) => {
    try {
      const page = Math.max(1, Number(request.query.page) || 1);
      const limit = Math.min(100, Math.max(1, Number(request.query.limit) || 50));
      const offset = (page - 1) * limit;
      const searchRaw = (request.query.search ?? '').trim();
      const search = searchRaw.replace(/[%_\\]/g, '\\$&');
      const filter = request.query.filter ?? 'all'; // all | in | out

      const conditions: string[] = [];
      const params: unknown[] = [];
      let paramIndex = 1;

      if (search) {
        conditions.push(
          `(a.telegram_id::text ILIKE $${paramIndex} OR a.username ILIKE $${paramIndex} OR a.content ILIKE $${paramIndex} OR a.handler ILIKE $${paramIndex})`
        );
        params.push(`%${search}%`);
        paramIndex += 1;
      }

      if (filter === 'in' || filter === 'out') {
        conditions.push(`a.direction = $${paramIndex}`);
        params.push(filter);
        paramIndex += 1;
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const countResult = await dbPool.query(
        `SELECT COUNT(*) FROM activity_logs a ${where}`,
        params,
      );
      const total = Number(countResult.rows[0].count);

      const dataResult = await dbPool.query(
        `SELECT a.id, a.telegram_id, a.username, a.direction, a.message_type,
                a.content, a.handler, a.created_at
         FROM activity_logs a
         ${where}
         ORDER BY a.created_at DESC
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...params, limit, offset],
      );

      return {
        logs: dataResult.rows,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      };
    } catch (err) {
      app.log.error(err, 'Failed to fetch activity logs');
      return reply.status(500).send({ error: 'Failed to load activity logs' });
    }
  }
);

/** GET /api/logs/system — system logs with search and level filter */
app.get<{
  Querystring: { page?: string; limit?: string; search?: string; filter?: string };
}>(
  '/api/logs/system',
  { preHandler: [authenticate] },
  async (request, reply) => {
    try {
      const page = Math.max(1, Number(request.query.page) || 1);
      const limit = Math.min(100, Math.max(1, Number(request.query.limit) || 50));
      const offset = (page - 1) * limit;
      const searchRaw = (request.query.search ?? '').trim();
      const search = searchRaw.replace(/[%_\\]/g, '\\$&');
      const filter = request.query.filter ?? 'all'; // all | info | warn | error

      const conditions: string[] = [];
      const params: unknown[] = [];
      let paramIndex = 1;

      if (search) {
        conditions.push(
          `(s.message ILIKE $${paramIndex} OR s.context::text ILIKE $${paramIndex})`
        );
        params.push(`%${search}%`);
        paramIndex += 1;
      }

      if (filter !== 'all') {
        conditions.push(`s.level = $${paramIndex}`);
        params.push(filter);
        paramIndex += 1;
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const countResult = await dbPool.query(
        `SELECT COUNT(*) FROM system_logs s ${where}`,
        params,
      );
      const total = Number(countResult.rows[0].count);

      const dataResult = await dbPool.query(
        `SELECT s.id, s.level, s.message, s.context, s.created_at
         FROM system_logs s
         ${where}
         ORDER BY s.created_at DESC
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...params, limit, offset],
      );

      return {
        logs: dataResult.rows,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      };
    } catch (err) {
      app.log.error(err, 'Failed to fetch system logs');
      return reply.status(500).send({ error: 'Failed to load system logs' });
    }
  }
);

/* ---------- Start ---------- */

try {
  await app.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`🔧 Admin API: http://localhost:${PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
