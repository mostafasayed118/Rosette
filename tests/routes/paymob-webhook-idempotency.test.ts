import { describe, expect, it, vi, beforeEach } from 'vitest';

type Insert = { table: string; op: string; payload?: Record<string, unknown> };

function fakeSupabase() {
  const calls: Insert[] = [];
  return {
    client: {
      from: (table: string) => ({
        insert: (payload: Record<string, unknown>) => { calls.push({ table, op: 'insert', payload }); return { error: null }; },
      }),
    },
    calls,
  };
}

beforeEach(() => {
  vi.resetModules();
});

describe('paymob webhook idempotency key contract', () => {
  it('builds the idempotency key from providerReference only (no success/failure suffix)', async () => {
    const { buildPaymobIdempotencyKey } = await import('@/features/payment/paymob-webhook');
    expect(buildPaymobIdempotencyKey('txn-1')).toBe('paymob:txn-1');
  });

  it('produces the same key regardless of the success flag — the route no longer branches on it', async () => {
    const { buildPaymobIdempotencyKey } = await import('@/features/payment/paymob-webhook');
    expect(buildPaymobIdempotencyKey('txn-1')).toBe('paymob:txn-1');
  });
});

describe('paymob webhook amount-mismatch path', () => {
  it('quarantines a bad payload and reports quarantined: true with status 200', async () => {
    const { client, calls } = fakeSupabase();
    const { handlePaymobAmountMismatch } = await import('@/features/payment/paymob-webhook');
    const result = await handlePaymobAmountMismatch({
      client,
      provider: 'paymob',
      providerReference: 'txn-1',
      orderReference: 'RO-1',
      orderTotalMinor: 11500,
      callbackAmountMinor: 9999,
      payload: { obj: { id: 'txn-1' } },
    });
    expect(result.quarantined).toBe(true);
    expect(result.status).toBe(200);
    const quarantineInsert = calls.find((c) => c.table === 'webhook_quarantine' && c.op === 'insert');
    expect(quarantineInsert).toBeDefined();
    expect(quarantineInsert?.payload).toMatchObject({ provider: 'paymob', provider_reference: 'txn-1' });
    expect(quarantineInsert?.payload?.error_message).toContain('amount_mismatch');
  });

  it('records both order and callback amounts in the error message', async () => {
    const { client, calls } = fakeSupabase();
    const { handlePaymobAmountMismatch } = await import('@/features/payment/paymob-webhook');
    await handlePaymobAmountMismatch({
      client,
      provider: 'paymob',
      providerReference: 'txn-2',
      orderReference: 'RO-2',
      orderTotalMinor: 20000,
      callbackAmountMinor: 10000,
      payload: {},
    });
    const quarantineInsert = calls.find((c) => c.table === 'webhook_quarantine');
    expect(quarantineInsert?.payload?.error_message).toContain('order=20000');
    expect(quarantineInsert?.payload?.error_message).toContain('callback=10000');
  });
});
