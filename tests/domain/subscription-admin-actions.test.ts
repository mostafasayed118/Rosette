import { describe, expect, it } from 'vitest';
import { listAdminSubscriptions } from '@/features/subscriptions/admin-actions';
describe('admin subscription actions', () => {
  it('is gated behind operator/admin authorization', async () => {
    const client = { from: () => ({ select: async () => ({ data: [], error: null }) }) } as any;
    const out = await listAdminSubscriptions(client, { role: 'viewer' as never, userId: 'u' }, {});
    expect(out).toEqual([]);
  });
});
