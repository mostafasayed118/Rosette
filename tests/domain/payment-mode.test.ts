import { afterEach, describe, expect, it, vi } from 'vitest';
import { getAvailablePaymentMethods, getCheckoutPaymentMethods, resolvePaymentMethodAvailability } from '@/features/checkout/payment-mode';

afterEach(() => vi.unstubAllEnvs());

describe('payment mode boundary', () => {
  it('offers only COD when Paymob is not enabled', () => {
    vi.stubEnv('PAYMENT_MODE', 'cod');
    expect(getAvailablePaymentMethods()).toEqual(['pay-on-delivery']);
  });

  it('offers Paymob and COD when Paymob test mode is configured', () => {
    vi.stubEnv('PAYMENT_MODE', 'paymob_test');
    vi.stubEnv('PAYMOB_API_KEY', 'test');
    vi.stubEnv('PAYMOB_PUBLIC_KEY', 'test');
    vi.stubEnv('PAYMOB_INTEGRATION_ID', '1');
    vi.stubEnv('PAYMOB_HMAC_SECRET', 'test');
    expect(getAvailablePaymentMethods()).toEqual(['paymob', 'pay-on-delivery']);
  });

  it('rejects a Paymob request when Paymob is not enabled', () => {
    vi.stubEnv('PAYMENT_MODE', 'cod');
    expect(resolvePaymentMethodAvailability('paymob')).toEqual({ allowed: false, error: 'payment_method_unavailable' });
  });

  it('allows COD without Paymob', () => {
    vi.stubEnv('PAYMENT_MODE', 'cod');
    expect(resolvePaymentMethodAvailability('pay-on-delivery')).toEqual({ allowed: true, paymob: false });
  });

  it('keeps the local demo methods when Supabase is not configured', () => {
    vi.stubEnv('PAYMENT_MODE', 'cod');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    expect(getCheckoutPaymentMethods()).toEqual(['paymob', 'pay-on-delivery', 'demo-card']);
  });
});
