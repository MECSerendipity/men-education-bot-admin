/** Simple structured logger for the bot */
export const logger = {
  info(message: string, data?: Record<string, unknown>) {
    console.log(JSON.stringify({ level: 'info', message, ...data, timestamp: new Date().toISOString() }));
  },
  warn(message: string, data?: Record<string, unknown>) {
    console.warn(JSON.stringify({ level: 'warn', message, ...data, timestamp: new Date().toISOString() }));
  },
  error(message: string, error?: unknown, data?: Record<string, unknown>) {
    const errorInfo = error instanceof Error
      ? { error: error.message, stack: error.stack }
      : { error: String(error) };
    console.error(JSON.stringify({ level: 'error', message, ...errorInfo, ...data, timestamp: new Date().toISOString() }));
  },
};
