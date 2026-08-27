import { describe, expect, it, vi } from 'vitest';
import { runSubscriptionsCron } from '@/features/subscriptions/subscriptions-cron';

describe('runSubscriptionsCron', () => {
  it('materializes due scheduled deliveries within the horizon', async () => {
    let ordered = false;
    const client = {
      from: (table: string) => {
        const base = {
          select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), gte: vi.fn().mockReturnThis(),
          lte: vi.fn().mockReturnThis(), is: vi.fn().mockReturnThis(), lt: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(), in: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(),
          update: vi.fn(() => {
            const b: any = {};
            b.eq = vi.fn(() => b);
            b.in = vi.fn(async () => ({ data: {}, error: null }));
            return b;
          }),
          insert: vi.fn(async () => ({ data: {}, error: null })),
        };
        if (table === 'subscriptions') return { ...base, select: vi.fn().mockReturnThis(), in: vi.fn().mockResolvedValue({ data: [{ id: 's1', status: 'active', frequency: 'weekly', first_delivery_date: '2026-09-12', bundle_size: 4, locale: 'en', renewal_nudge_sent_at: null, subscription_plans: { name_en: 'Plan' }, profiles: { email: 'a@b.c' } }], error: null }) };
        if (table === 'subscription_deliveries') return { ...base, select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), lte: vi.fn().mockResolvedValue({ data: [{ id: 'd1', status: 'scheduled', scheduled_date: '2026-09-15' }], error: null }) };
        return base;
      },
      rpc: vi.fn(async (name: string) => {
        if (name === 'materialize_subscription_delivery') { ordered = true; return { data: { status: 'ordered' }, error: null }; }
        return { data: true, error: null };
      }),
    } as any;
    const summary = await runSubscriptionsCron(client, { today: new Date('2026-09-14T00:00:00Z'), origin: 'https://shop', send: async () => {} });
    expect(summary.materialized).toBe(1);
    expect(ordered).toBe(true);
  });
});
