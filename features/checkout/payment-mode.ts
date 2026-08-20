import { getOptionalServerEnv } from '@/lib/server-env';
import { isPaymobEnabled } from '@/lib/runtime-config';
import type { PaymentMethod } from './types';

export type PaymentPath =
  | { allowed: true; paymob: boolean }
  | { allowed: false; error: 'payment_method_unavailable' };

export function resolvePaymentMethodAvailability(paymentMethod: PaymentMethod): PaymentPath {
  if (paymentMethod === 'paymob') {
    return isPaymobEnabled() ? { allowed: true, paymob: true } : { allowed: false, error: 'payment_method_unavailable' };
  }
  if (paymentMethod === 'pay-on-delivery') return { allowed: true, paymob: false };
  return { allowed: true, paymob: false };
}

export function getAvailablePaymentMethods(): PaymentMethod[] {
  const methods: PaymentMethod[] = ['pay-on-delivery'];
  if (isPaymobEnabled()) methods.unshift('paymob');
  return methods;
}

export function getCheckoutPaymentMethods(): PaymentMethod[] {
  const supabaseConfigured = Boolean(getOptionalServerEnv('NEXT_PUBLIC_SUPABASE_URL') && getOptionalServerEnv('SUPABASE_SERVICE_ROLE_KEY'));
  if (!supabaseConfigured) return ['paymob', 'pay-on-delivery', 'demo-card'];
  return getAvailablePaymentMethods();
}
