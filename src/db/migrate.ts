import { db } from './index.js';
import { logger } from '../utils/logger.js';

/** Run all migrations */
export async function migrate() {
  // ── users: profile only ──
  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id              SERIAL PRIMARY KEY,
      telegram_id     BIGINT UNIQUE NOT NULL,
      username        VARCHAR(255),
      first_name      VARCHAR(255),
      last_name       VARCHAR(255),
      email           VARCHAR(255),
      is_subscribed   BOOLEAN DEFAULT FALSE,
      rules_accepted  BOOLEAN DEFAULT FALSE,
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      updated_at      TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // ── subscriptions: subscription lifecycle ──
  await db.query(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      id              SERIAL PRIMARY KEY,
      user_id         INTEGER REFERENCES users(id),
      telegram_id     BIGINT NOT NULL,
      plan            VARCHAR(20) NOT NULL,
      method          VARCHAR(20) NOT NULL DEFAULT 'card',
      status          VARCHAR(20) DEFAULT 'Active',
      started_at      TIMESTAMPTZ DEFAULT NOW(),
      expires_at      TIMESTAMPTZ NOT NULL,
      card_pan        VARCHAR(20),
      rec_token       VARCHAR(255),
      prices          JSONB,
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      updated_at      TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // ── transactions: all payments (card + usdt) ──
  await db.query(`
    CREATE TABLE IF NOT EXISTS transactions (
      id              SERIAL PRIMARY KEY,
      user_id         INTEGER REFERENCES users(id),
      telegram_id     BIGINT NOT NULL,
      amount          DECIMAL(10,2) NOT NULL,
      currency        VARCHAR(10) NOT NULL,
      method          VARCHAR(20) NOT NULL,
      plan            VARCHAR(20) NOT NULL,
      status          VARCHAR(30) DEFAULT 'Pending',
      order_reference VARCHAR(255) UNIQUE,
      rec_token       VARCHAR(255),
      card_pan        VARCHAR(20),
      tx_hash         VARCHAR(255),
      subscription_id INTEGER REFERENCES subscriptions(id),
      created_at      TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // ── prices: global plan prices ──
  await db.query(`
    CREATE TABLE IF NOT EXISTS prices (
      key             VARCHAR(20) PRIMARY KEY,
      display_name    VARCHAR(255) NOT NULL,
      amount          DECIMAL(10,2) NOT NULL,
      currency        VARCHAR(10) NOT NULL,
      days            INTEGER NOT NULL,
      updated_at      TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // ── price_offers: individual price snapshot per user (one row = full snapshot) ──
  await db.query(`
    CREATE TABLE IF NOT EXISTS price_offers (
      id              SERIAL PRIMARY KEY,
      telegram_id     BIGINT UNIQUE NOT NULL,
      prices          JSONB NOT NULL,
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      updated_at      TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Seed default prices (only inserts if not already present)
  await db.query(`
    INSERT INTO prices (key, display_name, amount, currency, days) VALUES
      ('card_1m',    '🌂 1 місяць',   790,  'UAH',  30),
      ('card_6m',    '🎩 6 місяців',  3850, 'UAH',  180),
      ('card_12m',   '🏆 12 місяців', 6500, 'UAH',  365),
      ('crypto_1m',  '🌂 1 місяць',   18,   'USDT', 30),
      ('crypto_6m',  '🎩 6 місяців',  90,   'USDT', 180),
      ('crypto_12m', '🏆 12 місяців', 150,  'USDT', 365)
    ON CONFLICT (key) DO NOTHING;
  `);

  // ── texts: editable texts (admin panel) ──
  await db.query(`
    CREATE TABLE IF NOT EXISTS texts (
      key             VARCHAR(255) PRIMARY KEY,
      value           TEXT NOT NULL,
      updated_at      TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // ── invite_links: one-time invite links to private channels ──
  await db.query(`
    CREATE TABLE IF NOT EXISTS invite_links (
      id              SERIAL PRIMARY KEY,
      telegram_id     BIGINT NOT NULL,
      channel_id      BIGINT NOT NULL,
      invite_link     TEXT NOT NULL,
      status          VARCHAR(20) DEFAULT 'active',
      expires_at      TIMESTAMPTZ,
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(telegram_id, channel_id)
    );
  `);

  // ── indexes ──
  await db.query(`CREATE INDEX IF NOT EXISTS idx_subscriptions_telegram_id ON subscriptions (telegram_id)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_transactions_telegram_id ON transactions (telegram_id)`);
  // price_offers.telegram_id already has UNIQUE constraint — no separate index needed
  await db.query(`CREATE INDEX IF NOT EXISTS idx_subscriptions_active ON subscriptions (telegram_id) WHERE status = 'Active'`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_transactions_subscription_id ON transactions (subscription_id)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_invite_links_telegram_id ON invite_links (telegram_id)`);

  logger.info('Database migrated');
}
