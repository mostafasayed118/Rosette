import type { PaymentCallbackInput, PaymentTransitionResult } from './types';

export function paymentResultFromCallback(input: PaymentCallbackInput): PaymentTransitionResult {
  return { accepted: true, paymentStatus: input.success ? 'paid' : 'payment_failed' };
}
