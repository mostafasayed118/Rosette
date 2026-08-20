import { afterEach, describe, expect, it, vi } from 'vitest';
import { getDeploymentRuntime, getEmailDeliveryMode, getPaymentMode, isPaymobEnabled } from '@/lib/runtime-config';

afterEach(() => vi.unstubAllEnvs());

describe('runtime config', () => {
  it('defaults locally to node/smtp without provider configuration', () => {
    vi.stubEnv('DEPLOYMENT_RUNTIME', '');
    vi.stubEnv('PAYMENT_MODE', '');
    vi.stubEnv('EMAIL_DELIVERY_MODE', '');
    expect(getDeploymentRuntime()).toBe('node');
    expect(getPaymentMode()).toBe('cod');
    expect(getEmailDeliveryMode()).toBe('smtp');
  });

  it('defaults Cloudflare to disabled email without provider configuration', () => {
    vi.stubEnv('DEPLOYMENT_RUNTIME', 'cloudflare');
    vi.stubEnv('PAYMENT_MODE', '');
    vi.stubEnv('EMAIL_DELIVERY_MODE', '');
    expect(getPaymentMode()).toBe('cod');
    expect(getEmailDeliveryMode()).toBe('disabled');
    expect(isPaymobEnabled()).toBe(false);
  });

  it('never treats an invalid payment mode as live payment', () => {
    vi.stubEnv('PAYMENT_MODE', 'live');
    expect(getPaymentMode()).toBe('cod');
    expect(isPaymobEnabled()).toBe(false);
  });

  it('allows explicit Paymob test mode only when all Paymob values exist', () => {
    vi.stubEnv('PAYMENT_MODE', 'paymob_test');
    vi.stubEnv('PAYMOB_API_KEY', 'test');
    vi.stubEnv('PAYMOB_PUBLIC_KEY', 'test');
    vi.stubEnv('PAYMOB_INTEGRATION_ID', '1');
    vi.stubEnv('PAYMOB_HMAC_SECRET', 'test');
    expect(getPaymentMode()).toBe('paymob_test');
    expect(isPaymobEnabled()).toBe(true);
  });

  it('keeps Paymob disabled when test mode is requested without complete keys', () => {
    vi.stubEnv('PAYMENT_MODE', 'paymob_test');
    vi.stubEnv('PAYMOB_API_KEY', '');
    vi.stubEnv('PAYMOB_PUBLIC_KEY', '');
    vi.stubEnv('PAYMOB_INTEGRATION_ID', '');
    vi.stubEnv('PAYMOB_HMAC_SECRET', '');
    expect(isPaymobEnabled()).toBe(false);
  });

  it('accepts an explicit SMTP mode override on Cloudflare', () => {
    vi.stubEnv('DEPLOYMENT_RUNTIME', 'cloudflare');
    vi.stubEnv('EMAIL_DELIVERY_MODE', 'smtp');
    expect(getEmailDeliveryMode()).toBe('smtp');
  });
});
