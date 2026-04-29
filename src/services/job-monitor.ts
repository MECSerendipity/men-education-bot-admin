import { Telegraf } from 'telegraf';
import { JOB_MONITOR } from '../config.js';
import { logger } from '../utils/logger.js';

/** Send job execution result to admin channel job monitor thread */
export async function notifyJobResult(bot: Telegraf, params: {
  jobName: string;
  found: number;
  success: number;
  failed: number;
  details?: string;
}): Promise<void> {
  if (!JOB_MONITOR.channelId || !JOB_MONITOR.threadId) return;

  const status = params.failed === 0 ? '\u{2705}' : '\u{26A0}\u{FE0F}';
  const time = new Date().toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv' });

  let text = `${status} <b>${params.jobName}</b>\n\n`;
  text += `\u{1F4CB} Знайдено: ${params.found}\n`;
  text += `\u{2705} Успішно: ${params.success}\n`;

  if (params.failed > 0) {
    text += `\u{274C} Помилок: ${params.failed}\n`;
  }

  if (params.details) {
    text += `\n${params.details}\n`;
  }

  text += `\n\u{1F552} ${time}`;

  try {
    await bot.telegram.sendMessage(JOB_MONITOR.channelId, text, {
      parse_mode: 'HTML',
      message_thread_id: Number(JOB_MONITOR.threadId) || undefined,
    });
  } catch (err) {
    logger.error('Job monitor: failed to send notification', err);
  }
}

/** Send simple job status (for jobs that either run or don't) */
export async function notifyJobEmpty(bot: Telegraf, jobName: string): Promise<void> {
  // Don't spam when nothing to process
}
