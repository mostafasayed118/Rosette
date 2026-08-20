import { afterEach, describe, expect, it, vi } from 'vitest';
import { holdGiftCardForOrder, quoteGiftCard } from '@/features/gift-cards/service';

afterEach(() => vi.unstubAllEnvs());

type Client = { from: (table: string) => any; rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }> };

function quoteClient(card: Record<string, unknown> | null, holds: Array<Record<string, unknown>> = []): Client {
  return {
    from: (table: string) => ({
      select: () => ({
        eq: (_column: string, _value: unknown) => table === 'gift_card_holds'
          ? { eq: async () => ({ data: holds, error: null }) }
          : { maybeSingle: async () => ({ data: card, error: null }) },
      }),
    }),
    rpc: async () => ({ data: 'hold-1', error: null }),
  };
}

describe('gift-card checkout quote', () => {
  it('caps a valid active balance at the order total and returns only masked data', async () => {
    vi.stubEnv('GIFT_CARD_SECRET', 'test-secret');
    const result = await quoteGiftCard(quoteClient({ id: 'card-1', balance_minor: 75000, code_last4: 'ZZZZ', status: 'active', expires_at: '2027-08-20T00:00:00.000Z' }), { code: 'ROSE-ABCD-2345-ZZZZ', orderTotalMinor: 120000, now: new Date('2026-08-20T00:00:00Z') });
    expect(result).toEqual({ ok: true, value: { codeLast4: 'ZZZZ', amountAppliedMinor: 75000, remainingTotalMinor: 45000 } });
    expect(JSON.stringify(result)).not.toContain('ROSE');
  });

  it('subtracts unexpired holds before quoting available balance', async () => {
    vi.stubEnv('GIFT_CARD_SECRET', 'test-secret');
    const result = await quoteGiftCard(quoteClient({ id: 'card-1', balance_minor: 75000, code_last4: 'ZZZZ', status: 'active', expires_at: '2027-08-20T00:00:00.000Z' }, [{ amount_minor: 50000, expires_at: '2027-08-21T00:00:00.000Z' }]), { code: 'ROSE-ABCD-2345-ZZZZ', orderTotalMinor: 120000, now: new Date('2026-08-20T00:00:00Z') });
    expect(result).toEqual({ ok: true, value: { codeLast4: 'ZZZZ', amountAppliedMinor: 25000, remainingTotalMinor: 95000 } });
  });

  it.each([
    ['expired', { status: 'expired', expires_at: '2025-08-20T00:00:00.000Z' }],
    ['void', { status: 'void', expires_at: '2027-08-20T00:00:00.000Z' }],
    ['depleted', { status: 'depleted', balance_minor: 0, expires_at: '2027-08-20T00:00:00.000Z' }],
  ])('returns a generic error for a %s card', async (_label, card) => {
    vi.stubEnv('GIFT_CARD_SECRET', 'test-secret');
    expect(await quoteGiftCard(quoteClient({ balance_minor: 10000, code_last4: 'ZZZZ', ...card }), { code: 'ROSE-ABCD-2345-ZZZZ', orderTotalMinor: 120000 })).toEqual({ ok: false, error: 'invalid_gift_card' });
  });
});

describe('gift-card checkout hold', () => {
  it('hashes the code and reserves only the server-calculated amount', async () => {
    vi.stubEnv('GIFT_CARD_SECRET', 'test-secret');
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const client = quoteClient(null);
    client.rpc = async (name, args) => { calls.push({ name, args }); return { data: 'hold-1', error: null }; };
    expect(await holdGiftCardForOrder(client, { code: 'ROSE-ABCD-2345-ZZZZ', orderId: 'order-1', amountMinor: 75000 })).toEqual({ ok: true, holdId: 'hold-1' });
    expect(calls[0]).toMatchObject({ name: 'reserve_gift_card', args: { p_order_id: 'order-1', p_amount_minor: 75000, p_code_hash: expect.any(String) } });
    expect(calls[0]!.args.p_code_hash).not.toBe('ROSE-ABCD-2345-ZZZZ');
  });
});
