import { describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/subscriptions/route';
import * as auth from '@/features/auth/customer';

vi.mock('@/lib/turnstile', () => ({ checkTurnstileToken: vi.fn().mockResolvedValue('pass') }));
vi.mock('@/features/checkout/payment-mode', () => ({ resolvePaymentMethodAvailability: () => ({ allowed: true }) }));

describe('POST /api/subscriptions', () => {
  it('returns 401 when the customer is signed out', async () => {
    vi.spyOn(auth, 'getCurrentCustomer').mockResolvedValue(null);
    const res = await POST(new Request('http://localhost/api/subscriptions', { method: 'POST', body: '{}' }));
    expect(res.status).toBe(401);
  });
});
