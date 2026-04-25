import { createHmac } from 'node:crypto';
import { logger } from '../utils/logger.js';
import { escapeHtml } from '../utils/html.js';
import { WAYFORPAY } from '../config.js';

const WAYFORPAY_API_URL = 'https://api.wayforpay.com/api';

/** Generate HMAC-MD5 signature for WayForPay */
function hmacMd5(data: string): string {
  return createHmac('md5', WAYFORPAY.secretKey)
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
    WAYFORPAY.merchantAccount,
    WAYFORPAY.merchantDomain,
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

/** Create an invoice via WayForPay API and return the payment URL */
export async function createInvoice(params: {
  orderReference: string;
  amount: number;
  currency: string;
  productName: string;
  clientAccountId: string;
}): Promise<{ success: boolean; invoiceUrl?: string; reason?: string }> {
  const orderDate = Math.floor(Date.now() / 1000);
  const signature = generatePurchaseSignature({
    orderReference: params.orderReference,
    orderDate,
    amount: params.amount,
    currency: params.currency,
    productName: params.productName,
  });

  const serviceUrl = `${WAYFORPAY.webhookBaseUrl}/api/wayforpay/callback`;
  const returnUrl = `${WAYFORPAY.webhookBaseUrl}/pay/success`;

  const body = {
    transactionType: 'CREATE_INVOICE',
    merchantAccount: WAYFORPAY.merchantAccount,
    merchantDomainName: WAYFORPAY.merchantDomain,
    merchantAuthType: 'SimpleSignature',
    merchantSignature: signature,
    apiVersion: 1,
    orderReference: params.orderReference,
    orderDate,
    orderTimeout: 1800,
    amount: params.amount,
    currency: params.currency,
    productName: [params.productName],
    productPrice: [params.amount],
    productCount: [1],
    clientAccountId: params.clientAccountId,
    serviceUrl,
    returnUrl,
  };

  try {
    const response = await fetch(WAYFORPAY_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await response.json() as Record<string, unknown>;
    const invoiceUrl = data.invoiceUrl ? String(data.invoiceUrl) : undefined;

    if (!invoiceUrl) {
      logger.warn('WayForPay createInvoice failed', {
        orderReference: params.orderReference,
        reasonCode: data.reasonCode,
        reason: data.reason,
      });
      return { success: false, reason: String(data.reason ?? 'No invoiceUrl returned') };
    }

    return { success: true, invoiceUrl };
  } catch (err) {
    logger.error('WayForPay createInvoice request error', err);
    return { success: false, reason: 'Request failed' };
  }
}

/** Remove (cancel) a WayForPay invoice so the payment link becomes inactive */
export async function removeInvoice(orderReference: string): Promise<boolean> {
  const signString = [WAYFORPAY.merchantAccount, orderReference].join(';');
  const signature = hmacMd5(signString);

  const body = {
    apiVersion: 1,
    transactionType: 'REMOVE_INVOICE',
    merchantAccount: WAYFORPAY.merchantAccount,
    orderReference,
    merchantSignature: signature,
  };

  try {
    const response = await fetch(WAYFORPAY_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await response.json() as Record<string, unknown>;
    logger.info('WayForPay removeInvoice response', { orderReference, ...data });
    const success = data.reasonCode === 1100;

    if (!success) {
      logger.warn('WayForPay removeInvoice failed', { orderReference, reasonCode: data.reasonCode, reason: data.reason });
    }

    return success;
  } catch (err) {
    logger.error('WayForPay removeInvoice request error', err);
    return false;
  }
}

/** Check transaction status via WayForPay API */
export async function checkOrderStatus(orderReference: string): Promise<{
  transactionStatus: string;
  reasonCode: string;
  reason: string;
  recToken: string | null;
  cardPan: string | null;
}> {
  const signString = [WAYFORPAY.merchantAccount, orderReference].join(';');
  const signature = hmacMd5(signString);

  const body = {
    transactionType: 'CHECK_STATUS',
    merchantAccount: WAYFORPAY.merchantAccount,
    orderReference,
    merchantSignature: signature,
    apiVersion: 1,
  };

  try {
    const response = await fetch(WAYFORPAY_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await response.json() as Record<string, unknown>;

    return {
      transactionStatus: String(data.transactionStatus ?? ''),
      reasonCode: String(data.reasonCode ?? ''),
      reason: String(data.reason ?? ''),
      recToken: data.recToken ? String(data.recToken) : null,
      cardPan: data.cardPan ? String(data.cardPan) : null,
    };
  } catch (err) {
    logger.error('WayForPay checkOrderStatus request error', err);
    return { transactionStatus: '', reasonCode: '', reason: 'Request failed', recToken: null, cardPan: null };
  }
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
    merchantAccount: WAYFORPAY.merchantAccount,
    merchantDomainName: WAYFORPAY.merchantDomain,
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
