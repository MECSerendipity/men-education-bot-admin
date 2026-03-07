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

// CORS — only allow requests from localhost
await app.register(cors, {
  origin: [
    'http://localhost:5173',
    'http://localhost:3001',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:3001',
  ],
});

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
    reply.status(401).send({ error: 'Unauthorized' });
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
