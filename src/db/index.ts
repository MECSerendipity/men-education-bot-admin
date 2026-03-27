import pg from 'pg';
import 'dotenv/config';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

/** Get a client from the pool for queries */
export const db = {
  query: (text: string, params?: unknown[]) => pool.query(text, params),
  pool,
};
