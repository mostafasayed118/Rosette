import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMailTransport } from '@/features/notifications/gmail-mailer';
import { isEmailDeliveryDisabled } from '@/lib/runtime-config';

afterEach(() => vi.unstubAllEnvs());

const message = { from: 'a@b.c', to: 'd@e.f', subject: 's', text: 't', html: '<p>t</p>' };

describe('disabled email delivery', () => {
  it('returns a no-op transport without throwing when disabled', async () => {
    vi.stubEnv('DEPLOYMENT_RUNTIME', 'cloudflare');
    vi.stubEnv('EMAIL_DELIVERY_MODE', 'disabled');
    expect(isEmailDeliveryDisabled()).toBe(true);
    const transport = createMailTransport();
    await expect(transport.sendMail(message)).resolves.toEqual({ delivered: false, reason: 'disabled' });
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
