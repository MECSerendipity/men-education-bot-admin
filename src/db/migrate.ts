import { db } from './index.js';
import { logger } from '../utils/logger.js';

/** Run all migrations */
export async function migrate() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id              SERIAL PRIMARY KEY,
      telegram_id     BIGINT UNIQUE NOT NULL,
      username        VARCHAR(255),
      first_name      VARCHAR(255),
      last_name       VARCHAR(255),
      email           VARCHAR(255),
      is_subscribed   BOOLEAN DEFAULT FALSE,
      subscribed_at   TIMESTAMPTZ,
      expires_at      TIMESTAMPTZ,
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      updated_at      TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS texts (
      key             VARCHAR(255) PRIMARY KEY,
      value           TEXT NOT NULL,
      updated_at      TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS payments (
      id              SERIAL PRIMARY KEY,
      user_id         INTEGER REFERENCES users(id),
      amount          DECIMAL(10,2) NOT NULL,
      currency        VARCHAR(10) NOT NULL,
      method          VARCHAR(20) NOT NULL,
      plan            VARCHAR(10) NOT NULL,
      status          VARCHAR(20) DEFAULT 'pending',
      created_at      TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  logger.info('Database migrated');
}
