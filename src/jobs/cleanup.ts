import { db } from '../db/index.js';
import { logger } from '../utils/logger.js';

/** Delete activity logs and system logs older than 30 days */
export async function runCleanupJob(): Promise<void> {
  try {
    const activityResult = await db.query(
      `DELETE FROM activity_logs WHERE created_at < NOW() - INTERVAL '30 days'`,
    );
    const systemResult = await db.query(
      `DELETE FROM system_logs WHERE created_at < NOW() - INTERVAL '30 days'`,
    );
    const activityCount = activityResult.rowCount ?? 0;
    const systemCount = systemResult.rowCount ?? 0;

    if (activityCount > 0 || systemCount > 0) {
      logger.info('Cleanup job: deleted old logs', { activityLogs: activityCount, systemLogs: systemCount });
    }
  } catch (err) {
    logger.error('Cleanup job failed', err);
  }
}
