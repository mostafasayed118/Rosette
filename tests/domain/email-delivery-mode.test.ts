import { afterEach, describe, expect, it, vi } from 'vitest';
import { isEmailDeliveryDisabled } from '@/lib/runtime-config';

afterEach(() => vi.unstubAllEnvs());

describe('disabled email delivery', () => {
  it('reports disabled when EMAIL_DELIVERY_MODE is disabled on Cloudflare', () => {
    vi.stubEnv('DEPLOYMENT_RUNTIME', 'cloudflare');
    vi.stubEnv('EMAIL_DELIVERY_MODE', 'disabled');
    expect(isEmailDeliveryDisabled()).toBe(true);
  });

  it('defaults Cloudflare to disabled email', () => {
    vi.stubEnv('DEPLOYMENT_RUNTIME', 'cloudflare');
    vi.stubEnv('EMAIL_DELIVERY_MODE', '');
    expect(isEmailDeliveryDisabled()).toBe(true);
  });

  it('defaults Node to enabled email', () => {
    vi.stubEnv('DEPLOYMENT_RUNTIME', 'node');
    vi.stubEnv('EMAIL_DELIVERY_MODE', '');
    expect(isEmailDeliveryDisabled()).toBe(false);
  });
});

