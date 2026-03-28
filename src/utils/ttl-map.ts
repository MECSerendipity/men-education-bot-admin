/**
 * Map with automatic TTL-based cleanup of expired entries.
 * Each entry must have a `createdAt: number` field.
 */
export function createTtlMap<T extends { createdAt: number }>(
  ttlMs: number,
  cleanupIntervalMs = 5 * 60 * 1000,
): Map<number, T> {
  const map = new Map<number, T>();

  const interval = setInterval(() => {
    const now = Date.now();
    for (const [key, value] of map) {
      if (now - value.createdAt > ttlMs) {
        map.delete(key);
      }
    }
  }, cleanupIntervalMs);
  interval.unref();

  return map;
}
