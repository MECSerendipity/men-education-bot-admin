import { Telegraf } from 'telegraf';
import { getReferralByReferredId, activateReferral, getPartnerConfig, addPartnerEarning } from '../db/partners.js';
import { logger } from '../utils/logger.js';
import { TEXTS } from '../texts/index.js';

/**
 * Process partner commission after a successful payment.
 * Called from: WayForPay callback, charge job, USDT admin approve.
 *
 * Logic:
 * 1. Check if the paying user was referred (exists in referrals table)
 * 2. If referral is inactive — do nothing (chain is broken forever)
 * 3. If referral is 'clicked' — this is first payment → first commission (77%)
 * 4. If referral is 'active' — this is recurring → recurring commission (10%)
 * 5. Check if the corresponding toggle is enabled in partner_config
 * 6. Calculate and record the earning
 * 7. Notify partner about the earning
 */
export async function processPartnerCommission(bot: Telegraf, params: {
  referredTelegramId: number;
  transactionId: number;
  paymentAmount: number;
  paymentCurrency: string;
}): Promise<void> {
  try {
    const referral = await getReferralByReferredId(params.referredTelegramId);
    if (!referral) return; // Not a referred user

    if (referral.status === 'inactive') return; // Chain broken

    const config = await getPartnerConfig();

    let type: 'earning_first' | 'earning_recurring';
    let percentage: number;

    if (referral.status === 'clicked') {
      // First payment — always activate the referral, commission depends on config
      await activateReferral(params.referredTelegramId);
      if (!config.first_enabled) return;
      type = 'earning_first';
      percentage = config.first_percent;
    } else if (referral.status === 'active') {
      // Recurring payment — independent from first commission toggle
      if (!config.recurring_enabled) return;
      type = 'earning_recurring';
      percentage = config.recurring_percent;
    } else {
      return;
    }

    const earnedAmount = Math.round(params.paymentAmount * percentage) / 100;
    if (earnedAmount <= 0) return;

    const credited = await addPartnerEarning({
      partnerId: referral.referrer_id,
      referredId: params.referredTelegramId,
      transactionId: params.transactionId,
      type,
      amount: earnedAmount,
      currency: params.paymentCurrency,
      percentage,
    });

    if (!credited) {
      // Commission already exists for this transaction — skip notification to avoid misleading the partner.
      logger.warn('Duplicate partner commission attempt blocked', {
        partnerId: referral.referrer_id,
        referredId: params.referredTelegramId,
        transactionId: params.transactionId,
        type,
      });
      return;
    }

    logger.info('Partner commission processed', {
      partnerId: referral.referrer_id,
      referredId: params.referredTelegramId,
      type,
      amount: earnedAmount,
      currency: params.paymentCurrency,
      percentage,
    });

    // Notify partner about the earning
    const template = type === 'earning_first' ? TEXTS.PARTNER_COMMISSION_FIRST : TEXTS.PARTNER_COMMISSION_RECURRING;
    const message = template
      .replace('{amount}', earnedAmount.toFixed(2))
      .replace('{currency}', params.paymentCurrency)
      .replace('{percentage}', String(percentage));
    try {
      await bot.telegram.sendMessage(referral.referrer_id, message);
    } catch {
      // Partner may have blocked the bot — not critical
    }
  } catch (err) {
    // Commission processing should never break the main payment flow
    logger.error('Failed to process partner commission', err);
  }
}
