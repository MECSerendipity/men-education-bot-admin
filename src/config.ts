/** Support Telegram link — used in bot messages */
export const SUPPORT_URL = process.env.SUPPORT_URL ?? 'https://t.me/MEdopomoga';

/** WayForPay payment gateway config */
export const WAYFORPAY = {
  merchantAccount: process.env.WAYFORPAY_MERCHANT_ACCOUNT ?? '',
  secretKey: process.env.WAYFORPAY_SECRET_KEY ?? '',
  merchantDomain: process.env.WAYFORPAY_MERCHANT_DOMAIN ?? '',
  webhookBaseUrl: process.env.WAYFORPAY_WEBHOOK_BASE_URL ?? '',
} as const;

/** USDT crypto payment config */
export const USDT = {
  walletAddress: process.env.USDT_WALLET_ADDRESS ?? '',
  adminChannelId: process.env.ME_ADMIN_CHANNEL_ID ?? '',
  adminThreadId: process.env.ME_ADMIN_USDT_THREAD_ID ?? '',
} as const;

/** Card payment admin notification config */
export const CARD = {
  adminThreadId: process.env.ME_ADMIN_CARD_THREAD_ID ?? '',
} as const;

/** Admin whitelist — telegram IDs that can receive file_id from bot */
export const ADMIN_IDS: number[] = (process.env.ADMIN_TELEGRAM_IDS ?? '')
  .split(',')
  .map((id) => Number(id.trim()))
  .filter((id) => id > 0);

/** Job monitor — admin channel thread for job execution notifications */
export const JOB_MONITOR = {
  channelId: process.env.ME_ADMIN_CHANNEL_ID ?? '',
  threadId: process.env.ME_ADMIN_JOB_MONITOR_THREAD_ID ?? '',
} as const;

/** Partner system admin notification config */
export const PARTNER = {
  withdrawalThreadId: process.env.ME_ADMIN_PARTNER_WITHDRAWAL_THREAD_ID ?? '7',
  inactiveThreadId: process.env.ME_ADMIN_PARTNER_INACTIVE_THREAD_ID ?? '42',
} as const;
