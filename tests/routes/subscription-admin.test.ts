import { describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/admin/subscriptions/route';
import * as adminAuth from '@/features/auth/server';
describe('GET /api/admin/subscriptions', () => {
  it('returns 401 for a non-admin', async () => {
    vi.spyOn(adminAuth, 'getCurrentAdmin').mockResolvedValue(null);
    const res = await GET(new Request('http://localhost/api/admin/subscriptions'));
    expect(res.status).toBe(401);
  });
});
