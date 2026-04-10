import { db } from '../db/index.js';

/** Write a system log entry to the database (fire-and-forget) */
function writeToDb(level: string, message: string, context?: Record<string, unknown>): void {
  db.query(
    'INSERT INTO system_logs (level, message, context) VALUES ($1, $2, $3)',
    [level, message, context ? JSON.stringify(context) : null],
  ).catch((err) => {
    process.stderr.write(`[DB_LOG_FAILED] ${level}: ${message} — ${err}\n`);
  });
}

/** Simple structured logger for the bot — writes to console + DB */
export const logger = {
  info(message: string, data?: Record<string, unknown>) {
    console.log(JSON.stringify({ level: 'info', message, ...data, timestamp: new Date().toISOString() }));
    writeToDb('info', message, data);
  },
  warn(message: string, data?: Record<string, unknown>) {
    console.warn(JSON.stringify({ level: 'warn', message, ...data, timestamp: new Date().toISOString() }));
    writeToDb('warn', message, data);
  },
  error(message: string, error?: unknown, data?: Record<string, unknown>) {
    const errorInfo = error instanceof Error
      ? { error: error.message, stack: error.stack }
      : { error: String(error) };
    console.error(JSON.stringify({ level: 'error', message, ...errorInfo, ...data, timestamp: new Date().toISOString() }));
    writeToDb('error', message, { ...errorInfo, ...data });
  },
};
