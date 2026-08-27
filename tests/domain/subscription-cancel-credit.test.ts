import { describe, expect, it, vi } from 'vitest';
import * as crypto from '@/features/gift-cards/crypto';
import { cancelSubscriptionWithCredit } from '@/features/subscriptions/service';

vi.mock('@/features/gift-cards/crypto', () => ({
  generateGiftCardCode: vi.fn(() => 'SUBS-1234'),
  hashGiftCardCode: vi.fn(() => 'hashed'),
  encryptGiftCardCode: vi.fn(() => 'enc'),
  maskGiftCardCode: vi.fn(() => '••••1234'),
}));
vi.mock('@/lib/server-env', () => ({ getRequiredServerEnv: vi.fn(() => 'secret'), getOptionalServerEnv: vi.fn(() => undefined) }));

function makeClient(o: Record<string, any> = {}) {
  const insert = vi.fn(async (row: Record<string, unknown>) => ({ data: {}, error: null, row }));
  return {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue(
        o.ownership === false ? { data: null, error: null } : { data: { id: 'sub1', price_minor: 120000, bundle_size: 4, frequency: 'weekly', locale: 'en', recipient_email: 'a@b.c', customer_name: 'A' }, error: null }),
      insert,
    })),
    rpc: vi.fn(async (name: string) => name === 'cancel_subscription'
      ? { data: o.cancelResult ?? { cancelled: true, unmaterialized_count: 2 }, error: null }
      : { data: true, error: null }),
  } as any;
}

describe('cancelSubscriptionWithCredit', () => {
  it('rejects when not owned', async () => {
    const r = await cancelSubscriptionWithCredit(makeClient({ ownership: false }), 'sub1', 'cust1', { actor: 'customer', actorId: 'cust1' });
    expect(r.ok).toBe(false);
  });
  it('issues a gift card for the unmaterialized share (2 of 4 -> 60000)', async () => {
    const c = makeClient({});
    const r = await cancelSubscriptionWithCredit(c, 'sub1', 'cust1', { actor: 'customer', actorId: 'cust1' });
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.creditMinor).toBe(60000); expect(crypto.generateGiftCardCode).toHaveBeenCalled(); }
  });
  it('issues no card when nothing remains', async () => {
    const r = await cancelSubscriptionWithCredit(makeClient({ cancelResult: { cancelled: true, unmaterialized_count: 0 } }), 'sub1', 'cust1', { actor: 'customer', actorId: 'cust1' });
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.creditMinor).toBe(0); expect(r.giftCardCodeLast4).toBeNull(); }
  });
});
