import { createHmac } from 'node:crypto';
import { logger } from '../utils/logger.js';
import { escapeHtml } from '../utils/html.js';

const WAYFORPAY_API_URL = 'https://api.wayforpay.com/api';

function getMerchantAccount(): string {
  return process.env.WAYFORPAY_MERCHANT_ACCOUNT ?? '';
}

function getSecretKey(): string {
  return process.env.WAYFORPAY_SECRET_KEY ?? '';
}

function getMerchantDomain(): string {
  return process.env.WAYFORPAY_MERCHANT_DOMAIN ?? '';
}

function getWebhookBaseUrl(): string {
  return process.env.WEBHOOK_BASE_URL ?? '';
}

/** Plan definitions: amount, currency, duration in months */
export const PLANS: Record<string, { amount: number; currency: string; months: number; label: string }> = {
  card_1m:  { amount: 790,  currency: 'UAH', months: 1,  label: 'Підписка ME Club — 1 місяць' },
  card_6m:  { amount: 3850, currency: 'UAH', months: 6,  label: 'Підписка ME Club — 6 місяців' },
  card_12m: { amount: 6500, currency: 'UAH', months: 12, label: 'Підписка ME Club — 12 місяців' },
};

/** Generate HMAC-MD5 signature for WayForPay */
function hmacMd5(data: string): string {
  return createHmac('md5', getSecretKey())
    .update(data, 'utf8')
    .digest('hex');
}

/** Generate signature for Purchase request */
export function generatePurchaseSignature(params: {
  orderReference: string;
  orderDate: number;
  amount: number;
  currency: string;
  productName: string;
}): string {
  const signString = [
    getMerchantAccount(),
    getMerchantDomain(),
    params.orderReference,
    params.orderDate,
    params.amount,
    params.currency,
    params.productName,
    1, // productCount
    params.amount, // productPrice
  ].join(';');
  return hmacMd5(signString);
}

/** Generate signature to verify WayForPay callback */
export function generateCallbackSignature(params: {
  merchantAccount: string;
  orderReference: string;
  amount: string;
  currency: string;
  authCode: string;
  cardPan: string;
  transactionStatus: string;
  reasonCode: string;
}): string {
  const signString = [
    params.merchantAccount,
    params.orderReference,
    params.amount,
    params.currency,
    params.authCode,
    params.cardPan,
    params.transactionStatus,
    params.reasonCode,
  ].join(';');
  return hmacMd5(signString);
}

/** Generate signature for callback response to WayForPay */
export function generateResponseSignature(orderReference: string, status: string, time: number): string {
  const signString = [orderReference, status, time].join(';');
  return hmacMd5(signString);
}

/** Build HTML page that auto-submits payment form to WayForPay */
export function buildPaymentPage(params: {
  orderReference: string;
  orderDate: number;
  amount: number;
  currency: string;
  productName: string;
}): string {
  const signature = generatePurchaseSignature(params);
  const serviceUrl = `${getWebhookBaseUrl()}/api/wayforpay/callback`;
  const returnUrl = `${getWebhookBaseUrl()}/pay/success`;

  // Escape all dynamic values to prevent XSS
  const eMerchant = escapeHtml(getMerchantAccount());
  const eDomain = escapeHtml(getMerchantDomain());
  const eSignature = escapeHtml(signature);
  const eOrderRef = escapeHtml(params.orderReference);
  const eProductName = escapeHtml(params.productName);
  const eServiceUrl = escapeHtml(serviceUrl);
  const eReturnUrl = escapeHtml(returnUrl);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Оплата ME Club</title>
  <style>
    body { font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #f5f5f5; }
    .loading { text-align: center; }
    .spinner { border: 4px solid #ddd; border-top: 4px solid #333; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin: 0 auto 16px; }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="loading">
    <div class="spinner"></div>
    <p>Переходимо на сторінку оплати...</p>
  </div>
  <form id="wayforpay" action="https://secure.wayforpay.com/pay" method="POST" style="display:none">
    <input name="merchantAccount" value="${eMerchant}">
    <input name="merchantDomainName" value="${eDomain}">
    <input name="merchantSignature" value="${eSignature}">
    <input name="merchantTransactionSecureType" value="AUTO">
    <input name="orderReference" value="${eOrderRef}">
    <input name="orderDate" value="${params.orderDate}">
    <input name="amount" value="${params.amount}">
    <input name="currency" value="${escapeHtml(params.currency)}">
    <input name="productName[]" value="${eProductName}">
    <input name="productCount[]" value="1">
    <input name="productPrice[]" value="${params.amount}">
    <input name="serviceUrl" value="${eServiceUrl}">
    <input name="returnUrl" value="${eReturnUrl}">
  </form>
  <script>document.getElementById('wayforpay').submit();</script>
</body>
</html>`;
}

/** Charge a card using recToken (for recurring payments) */
export async function chargeWithToken(params: {
  orderReference: string;
  amount: number;
  currency: string;
  productName: string;
  recToken: string;
  clientEmail?: string;
  clientPhone?: string;
  clientFirstName?: string;
  clientLastName?: string;
}): Promise<{ success: boolean; transactionStatus?: string; reasonCode?: string; reason?: string }> {
  const orderDate = Math.floor(Date.now() / 1000);
  const signature = generatePurchaseSignature({
    orderReference: params.orderReference,
    orderDate,
    amount: params.amount,
    currency: params.currency,
    productName: params.productName,
  });

  const body = {
    transactionType: 'CHARGE',
    merchantAccount: getMerchantAccount(),
    merchantDomainName: getMerchantDomain(),
    merchantTransactionType: 'SALE',
    merchantTransactionSecureType: 'NON3DS',
    merchantSignature: signature,
    apiVersion: 1,
    orderReference: params.orderReference,
    orderDate,
    amount: params.amount,
    currency: params.currency,
    recToken: params.recToken,
    productName: [params.productName],
    productPrice: [params.amount],
    productCount: [1],
    clientFirstName: params.clientFirstName ?? 'Customer',
    clientLastName: params.clientLastName ?? 'Customer',
    clientEmail: params.clientEmail ?? 'customer@example.com',
    clientPhone: params.clientPhone ?? '380000000000',
    clientCountry: 'UKR',
  };

  try {
    const response = await fetch(WAYFORPAY_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await response.json() as Record<string, unknown>;
    const transactionStatus = String(data.transactionStatus ?? '');
    const success = transactionStatus === 'Approved';

    if (!success) {
      logger.warn('WayForPay charge failed', {
        orderReference: params.orderReference,
        transactionStatus,
        reasonCode: data.reasonCode,
        reason: data.reason,
      });
    }

    return {
      success,
      transactionStatus,
      reasonCode: String(data.reasonCode ?? ''),
      reason: String(data.reason ?? ''),
    };
  } catch (err) {
    logger.error('WayForPay charge request error', err);
    return { success: false, reason: 'Request failed' };
  }
}
