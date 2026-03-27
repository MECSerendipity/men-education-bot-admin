import pg from 'pg';
import 'dotenv/config';
import { logger } from '../utils/logger.js';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

// Prevent unhandled errors from crashing the process when idle clients
// receive errors (e.g. database restart, network blip)
pool.on('error', (err) => {
  logger.error('Unexpected database pool error', err);
});

/** Get a client from the pool for queries */
export const db = {
  query: (text: string, params?: unknown[]) => pool.query(text, params),
  pool,
};
