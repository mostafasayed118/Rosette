import { describe, expect, it } from 'vitest';
import { settleGiftCardOrderPayment } from '@/features/gift-cards/service';

describe('gift-card order payment settlement', () => {
  it('redeems the hold exactly once on a successful callback', async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const client = { rpc: async (name: string, args: Record<string, unknown>) => { calls.push({ name, args }); return { data: true, error: null }; } };
    expect(await settleGiftCardOrderPayment(client, { id: 'o1', gift_card_hold_id: 'hold-1' }, { success: true, providerReference: 'txn-1' })).toEqual({ ok: true });
    expect(calls).toEqual([{ name: 'redeem_gift_card_hold', args: { p_hold_id: 'hold-1', p_idempotency_key: 'gift-card-redeem:txn-1' } }]);
  });

  it('releases the hold on a failed callback', async () => {
    const calls: string[] = [];
    const client = { rpc: async (name: string) => { calls.push(name); return { data: true, error: null }; } };
    expect(await settleGiftCardOrderPayment(client, { id: 'o1', gift_card_hold_id: 'hold-1' }, { success: false, providerReference: 'txn-2' })).toEqual({ ok: true });
    expect(calls).toEqual(['release_gift_card_hold']);
  });
});
