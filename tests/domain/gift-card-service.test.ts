import { describe, expect, it } from 'vitest';
import { activateGiftCardPurchase, createGiftCardPurchase, restoreGiftCardForCancelledOrder } from '@/features/gift-cards/service';
import { encryptGiftCardCode } from '@/features/gift-cards/crypto';

const input = {
  mode: 'fixed' as const,
  amountMinor: 100000,
  senderName: 'Maya',
  senderEmail: 'maya@example.com',
  recipientName: 'Nour',
  recipientEmail: 'nour@example.com',
  message: 'A little joy',
  locale: 'en' as const,
};

type Call = { table: string; op: string; payload?: Record<string, unknown>; id?: string };

function fakeClient(seed: { purchase?: Record<string, unknown> | null; insertError?: boolean; existingCard?: Record<string, unknown> | null; claimResults?: boolean[] } = {}) {
  const calls: Call[] = [];
  let purchase = seed.purchase ?? null;
  let claimIndex = 0;
  const from = (table: string) => ({
    insert: (payload: Record<string, unknown>) => {
      calls.push({ table, op: 'insert', payload });
      if (table === 'gift_card_purchases' && !seed.insertError) purchase = payload;
      return { select: () => ({ single: async () => ({ data: { id: payload.id }, error: seed.insertError ? { message: 'insert failed' } : null }) }), error: seed.insertError ? { message: 'insert failed' } : null };
    },
    upsert: (payload: Record<string, unknown>, _options?: unknown) => { calls.push({ table, op: 'upsert', payload }); return { error: null }; },
    select: () => ({ eq: (column: string, _value: string) => ({ maybeSingle: async () => ({ data: column === 'purchase_id' ? (seed.existingCard ?? null) : purchase, error: null }) }) }),
    update: (payload: Record<string, unknown>) => ({ eq: (_column: string, _value: string) => { calls.push({ table, op: 'update', payload }); if (table === 'gift_card_purchases') purchase = { ...purchase, ...payload }; return { error: null }; } }),
  });
  const rpc = async (name: string, args: Record<string, unknown>) => {
    calls.push({ table: 'rpc', op: name, payload: args });
    if (name === 'claim_gift_card_delivery') return { data: seed.claimResults ? (seed.claimResults[claimIndex++] ?? false) : true, error: null };
    return { data: true, error: null };
  };
  return { client: { from, rpc }, calls };
}

describe('createGiftCardPurchase', () => {
  it('creates a pending purchase and returns only a public reference and checkout URL', async () => {
    const { client, calls } = fakeClient();
    const result = await createGiftCardPurchase(client, input, {
      origin: 'https://shop.example.com',
      createIntention: async (payment) => {
        expect(payment.amountMinor).toBe(100000);
        expect(payment.orderReference).toMatch(/^GC-/);
        return { providerReference: 'provider-1', checkoutUrl: 'https://paymob.test/checkout' };
      },
    });
    expect(result).toMatchObject({ ok: true, value: { reference: expect.stringMatching(/^GC-/), checkoutUrl: 'https://paymob.test/checkout' } });
    expect(JSON.stringify(result)).not.toContain('Maya');
    expect(calls.find((call) => call.table === 'gift_card_purchases' && call.op === 'insert')?.payload).toMatchObject({ status: 'pending', amount_minor: 100000, reference: expect.stringMatching(/^GC-/) });
  });
});

describe('activateGiftCardPurchase', () => {
  const purchase = { id: 'purchase-1', reference: 'GC-PURCHASE1', amount_minor: 100000, status: 'pending', sender_name: 'Maya', sender_email: 'maya@example.com', recipient_name: 'Nour', recipient_email: 'nour@example.com', message: 'A little joy', locale: 'en' };
  const transaction = { specialReference: 'giftcard:purchase-1', amountMinor: 100000, providerReference: 'provider-1', success: true };

  it('activates exactly one card after a verified successful payment', async () => {
    const { client, calls } = fakeClient({ purchase });
    const deliveries: string[] = [];
    const result = await activateGiftCardPurchase(client, transaction, {
      secret: 'test-secret',
      deliver: async ({ recipient }) => { deliveries.push(recipient); return true; },
    });
    expect(result).toEqual({ handled: true, status: 'activated' });
    expect(calls.filter((call) => call.table === 'gift_cards' && call.op === 'insert')).toHaveLength(1);
    expect(calls.filter((call) => call.table === 'gift_card_transactions' && call.op === 'insert')).toHaveLength(1);
    expect(deliveries).toEqual(['maya@example.com', 'nour@example.com']);
  });

  it('rejects an amount mismatch without creating a card', async () => {
    const { client, calls } = fakeClient({ purchase });
    const result = await activateGiftCardPurchase(client, { ...transaction, amountMinor: 99999 }, { secret: 'test-secret' });
    expect(result).toEqual({ handled: true, status: 'failed' });
    expect(calls.find((call) => call.table === 'gift_cards')).toBeUndefined();
  });

  it('treats a duplicate paid callback as an idempotent success', async () => {
    const { client, calls } = fakeClient({ purchase: { ...purchase, status: 'paid' } });
    const result = await activateGiftCardPurchase(client, transaction, { secret: 'test-secret' });
    expect(result).toEqual({ handled: true, status: 'already_processed' });
    expect(calls.find((call) => call.table === 'gift_cards')).toBeUndefined();
  });

  it('records delivery outcome on the card row as well as the purchase', async () => {
    const { client, calls } = fakeClient({ purchase });
    const result = await activateGiftCardPurchase(client, transaction, { secret: 'test-secret', deliver: async () => true });
    expect(result).toEqual({ handled: true, status: 'activated' });
    const deliveryComplete = calls.find((call) => call.table === 'rpc' && call.op === 'complete_gift_card_delivery');
    expect(deliveryComplete?.payload).toMatchObject({ p_status: 'sent', p_error: null });
  });

  it('recovers a pending purchase that already has a card without issuing a second one', async () => {
    const existingCard = { id: 'card-1', purchase_id: 'purchase-1', delivery_status: 'sent', code_ciphertext: 'v1.x.y.z' };
    const { client, calls } = fakeClient({ purchase, existingCard });
    const result = await activateGiftCardPurchase(client, transaction, { secret: 'test-secret' });
    expect(result).toEqual({ handled: true, status: 'activated' });
    expect(calls.filter((call) => call.table === 'gift_cards' && call.op === 'insert')).toHaveLength(0);
    expect(calls.find((call) => call.table === 'gift_card_purchases' && call.op === 'update')?.payload).toMatchObject({ status: 'paid' });
  });

  it('backfills the issue ledger row idempotently when recovering a stranded card', async () => {
    const existingCard = { id: 'card-1', purchase_id: 'purchase-1', delivery_status: 'sent', code_ciphertext: 'v1.x.y.z' };
    const { client, calls } = fakeClient({ purchase, existingCard });
    const result = await activateGiftCardPurchase(client, transaction, { secret: 'test-secret' });
    expect(result).toEqual({ handled: true, status: 'activated' });
    expect(calls.find((call) => call.table === 'gift_card_transactions' && call.op === 'upsert')?.payload).toMatchObject({ type: 'issue', idempotency_key: 'gift-card-issue:purchase-1' });
  });

  it('re-delivers a recovered card only when its delivery is still pending', async () => {
    const ciphertext = encryptGiftCardCode('ROSE-ABCD-1234', 'test-secret');
    const existingCard = { id: 'card-1', purchase_id: 'purchase-1', delivery_status: 'pending', code_ciphertext: ciphertext };
    const { client, calls } = fakeClient({ purchase, existingCard });
    const deliveries: Array<{ recipient: string; code: string }> = [];
    const result = await activateGiftCardPurchase(client, transaction, { secret: 'test-secret', deliver: async ({ recipient, code }) => { deliveries.push({ recipient, code }); return true; } });
    expect(result).toEqual({ handled: true, status: 'activated' });
    expect(deliveries).toEqual([
      { recipient: 'maya@example.com', code: 'ROSE-ABCD-1234' },
      { recipient: 'nour@example.com', code: 'ROSE-ABCD-1234' },
    ]);
    expect(calls.find((call) => call.table === 'rpc' && call.op === 'complete_gift_card_delivery')?.payload).toMatchObject({ p_status: 'sent' });
  });

  it('does not re-deliver a recovered card that was already sent', async () => {
    const ciphertext = encryptGiftCardCode('ROSE-ABCD-1234', 'test-secret');
    const existingCard = { id: 'card-1', purchase_id: 'purchase-1', delivery_status: 'sent', code_ciphertext: ciphertext };
    const { client } = fakeClient({ purchase, existingCard });
    let delivered = 0;
    const result = await activateGiftCardPurchase(client, transaction, { secret: 'test-secret', deliver: async () => { delivered += 1; return true; } });
    expect(result).toEqual({ handled: true, status: 'activated' });
    expect(delivered).toBe(0);
  });

  it('delivers a recovered card once when two callbacks race', async () => {
    const ciphertext = encryptGiftCardCode('ROSE-ABCD-1234', 'test-secret');
    const existingCard = { id: 'card-1', purchase_id: 'purchase-1', delivery_status: 'pending', code_ciphertext: ciphertext };
    const { client } = fakeClient({ purchase, existingCard, claimResults: [true, false] });
    let delivered = 0;
    const deliver = async () => { await new Promise((resolve) => setTimeout(resolve, 0)); delivered += 1; return true; };
    const results = await Promise.all([
      activateGiftCardPurchase(client, transaction, { secret: 'test-secret', deliver }),
      activateGiftCardPurchase(client, transaction, { secret: 'test-secret', deliver }),
    ]);
    expect(results).toEqual([
      { handled: true, status: 'activated' },
      { handled: true, status: 'activated' },
    ]);
    expect(delivered).toBe(2);
  });
});

describe('gift-card cancellation restoration', () => {
  it('restores a redeemed balance through one idempotent RPC', async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const client = { rpc: async (name: string, args: Record<string, unknown>) => { calls.push({ name, args }); return { data: true, error: null }; } };
    expect(await restoreGiftCardForCancelledOrder(client, { orderId: 'order-1', giftCardId: 'card-1', amountMinor: 75000 })).toBe('restored');
    expect(calls).toEqual([{ name: 'refund_gift_card_redemption', args: { p_gift_card_id: 'card-1', p_order_id: 'order-1', p_amount_minor: 75000, p_idempotency_key: 'gift-card-refund:order-1' } }]);
  });
});
