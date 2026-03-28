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
      type            VARCHAR(20) NOT NULL DEFAULT 'card',
      status          VARCHAR(20) DEFAULT 'Active',
      started_at      TIMESTAMPTZ DEFAULT NOW(),
      expires_at      TIMESTAMPTZ NOT NULL,
      auto_renew      BOOLEAN DEFAULT FALSE,
      prices          JSONB,
      transaction_id  INTEGER,
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
      created_at      TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // ── prices: global plan prices ──
  await db.query(`
    CREATE TABLE IF NOT EXISTS prices (
      key             VARCHAR(20) PRIMARY KEY,
      amount          DECIMAL(10,2) NOT NULL,
      currency        VARCHAR(10) NOT NULL,
      days          INTEGER NOT NULL,
      label           VARCHAR(255) NOT NULL,
      updated_at      TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // ── price_offers: individual price offers per user ──
  await db.query(`
    CREATE TABLE IF NOT EXISTS price_offers (
      id              SERIAL PRIMARY KEY,
      telegram_id     BIGINT NOT NULL,
      key             VARCHAR(20) NOT NULL,
      amount          DECIMAL(10,2) NOT NULL,
      currency        VARCHAR(10) NOT NULL,
      days          INTEGER NOT NULL,
      label           VARCHAR(255) NOT NULL,
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(telegram_id, key)
    );
  `);

  // Seed default prices (only inserts if not already present)
  await db.query(`
    INSERT INTO prices (key, amount, currency, days, label) VALUES
      ('card_1m',    790,  'UAH',  30,  'Підписка ME Club — 1 місяць'),
      ('card_6m',    3850, 'UAH',  180, 'Підписка ME Club — 6 місяців'),
      ('card_12m',   6500, 'UAH',  365, 'Підписка ME Club — 12 місяців'),
      ('crypto_1m',  18,   'USDT', 30,  'Підписка ME Club — 1 місяць'),
      ('crypto_6m',  90,   'USDT', 180, 'Підписка ME Club — 6 місяців'),
      ('crypto_12m', 150,  'USDT', 365, 'Підписка ME Club — 12 місяців')
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

  // ── normalize statuses to PascalCase ──
  await db.query(`ALTER TABLE transactions ALTER COLUMN status SET DEFAULT 'Pending'`);
  await db.query(`ALTER TABLE subscriptions ALTER COLUMN status SET DEFAULT 'Active'`);
  await db.query(`UPDATE transactions SET status = 'Pending' WHERE status = 'pending'`);
  await db.query(`UPDATE transactions SET status = 'Approved' WHERE status = 'approved'`);
  await db.query(`UPDATE transactions SET status = 'Declined' WHERE status = 'declined'`);
  await db.query(`UPDATE transactions SET status = 'Expired' WHERE status = 'expired'`);
  await db.query(`UPDATE transactions SET status = 'Cancelled' WHERE status = 'cancelled'`);
  await db.query(`UPDATE transactions SET status = 'WaitingConfirmation' WHERE status = 'waiting_confirmation'`);
  await db.query(`UPDATE subscriptions SET status = 'Active' WHERE status = 'active'`);
  await db.query(`UPDATE subscriptions SET status = 'Expired' WHERE status = 'expired'`);

  // ── indexes ──
  await db.query(`CREATE INDEX IF NOT EXISTS idx_subscriptions_telegram_id ON subscriptions (telegram_id)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_transactions_telegram_id ON transactions (telegram_id)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_price_offers_telegram_id ON price_offers (telegram_id)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_subscriptions_active ON subscriptions (telegram_id) WHERE status = 'Active'`);

  logger.info('Database migrated');
}
