import { db } from '../db/index.js';
import { logger } from '../utils/logger.js';

/** Delete system logs older than 30 days */
export async function runCleanupJob(): Promise<void> {
  try {
    const systemResult = await db.query(
      `DELETE FROM system_logs WHERE created_at < NOW() - INTERVAL '30 days'`,
    );
    const systemCount = systemResult.rowCount ?? 0;

    if (systemCount > 0) {
      logger.info('Cleanup job: deleted old logs', { systemLogs: systemCount });
    }
  } catch (err) {
    logger.error('Cleanup job failed', err);
  }
}
