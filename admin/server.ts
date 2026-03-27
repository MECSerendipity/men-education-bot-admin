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
    const { login, password } = request.body;

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
      const search = (request.query.search ?? '').trim();
      const filter = request.query.filter ?? 'all'; // all | active | inactive

      const conditions: string[] = [];
      const params: unknown[] = [];
      let paramIndex = 1;

      // Search by username, first_name, last_name, telegram_id or id (all CONTAINS)
      if (search) {
        conditions.push(
          `(id::text ILIKE $${paramIndex} OR telegram_id::text ILIKE $${paramIndex} OR username ILIKE $${paramIndex} OR first_name ILIKE $${paramIndex} OR last_name ILIKE $${paramIndex} OR email ILIKE $${paramIndex})`
        );
        params.push(`%${search}%`);
        paramIndex += 1;
      }

      // Subscription filter
      if (filter === 'active') {
        conditions.push(`is_subscribed = TRUE AND expires_at > NOW()`);
      } else if (filter === 'inactive') {
        conditions.push(`(is_subscribed = FALSE OR expires_at IS NULL OR expires_at <= NOW())`);
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      // Count total + counts per filter (for tab badges)
      const countResult = await dbPool.query(
        `SELECT COUNT(*) FROM users ${where}`,
        params,
      );
      const total = Number(countResult.rows[0].count);

      // Search-only conditions (without subscription filter) for tab counts
      const searchConditions: string[] = [];
      const searchParams: unknown[] = [];
      if (search) {
        searchConditions.push(
          `(id::text ILIKE $1 OR telegram_id::text ILIKE $1 OR username ILIKE $1 OR first_name ILIKE $1 OR last_name ILIKE $1 OR email ILIKE $1)`
        );
        searchParams.push(`%${search}%`);
      }
      const searchWhere = searchConditions.length > 0 ? `WHERE ${searchConditions.join(' AND ')}` : '';

      const countsResult = await dbPool.query(
        `SELECT
           COUNT(*) AS total_all,
           COUNT(*) FILTER (WHERE is_subscribed = TRUE AND expires_at > NOW()) AS total_active,
           COUNT(*) FILTER (WHERE is_subscribed = FALSE OR expires_at IS NULL OR expires_at <= NOW()) AS total_inactive
         FROM users ${searchWhere}`,
        searchParams,
      );
      const counts = {
        all: Number(countsResult.rows[0].total_all),
        active: Number(countsResult.rows[0].total_active),
        inactive: Number(countsResult.rows[0].total_inactive),
      };

      // Fetch page
      const dataResult = await dbPool.query(
        `SELECT id, telegram_id, username, first_name, last_name, email,
                is_subscribed, subscribed_at, expires_at, created_at
         FROM users ${where}
         ORDER BY created_at DESC
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
      const { value } = request.body;

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

/* ---------- Start ---------- */

try {
  await app.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`🔧 Admin API: http://localhost:${PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
