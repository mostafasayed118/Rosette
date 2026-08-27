import { describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/account/subscriptions/route';
import * as auth from '@/features/auth/customer';
describe('GET /api/account/subscriptions', () => {
  it('returns 401 when signed out', async () => {
    vi.spyOn(auth, 'getCurrentCustomer').mockResolvedValue(null);
    const res = await GET(new Request('http://localhost/api/account/subscriptions'));
    expect(res.status).toBe(401);
  });
});
