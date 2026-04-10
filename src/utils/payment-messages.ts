interface PaymentMessage {
  chatId: number;
  messageId: number;
  createdAt: number;
}

/** Track payment messages by orderReference so we can edit them after callback */
const paymentMessages = new Map<string, PaymentMessage>();

// Cleanup expired entries every 5 minutes (15 min TTL)
const PAYMENT_MSG_TTL = 15 * 60 * 1000;
const cleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [key, value] of paymentMessages) {
    if (now - value.createdAt > PAYMENT_MSG_TTL) {
      paymentMessages.delete(key);
    }
  }
}, 5 * 60 * 1000);
cleanupInterval.unref();

export function savePaymentMessage(orderReference: string, chatId: number, messageId: number): void {
  paymentMessages.set(orderReference, { chatId, messageId, createdAt: Date.now() });
}

export function getPaymentMessage(orderReference: string): PaymentMessage | undefined {
  return paymentMessages.get(orderReference);
}

export function deletePaymentMessage(orderReference: string): void {
  paymentMessages.delete(orderReference);
}
