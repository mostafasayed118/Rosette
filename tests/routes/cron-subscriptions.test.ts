import { describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/cron/subscriptions/route';
import * as cronLib from '@/lib/cron';
vi.mock('@/features/subscriptions/subscriptions-cron', () => ({ runSubscriptionsCron: vi.fn(async () => ({ materialized: 1, nudgesSent: 0, completed: 0, expired: 0, failed: 0 })) }));
describe('POST /api/cron/subscriptions', () => {
  it('rejects missing auth', async () => {
    vi.spyOn(cronLib, 'isCronAuthorizedForJob').mockReturnValue(false);
    const res = await POST(new Request('http://localhost/api/cron/subscriptions', { method: 'POST' }));
    expect(res.status).toBe(401);
  });
});
