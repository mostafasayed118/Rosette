import { describe, expect, it } from 'vitest';
import { getCartByRestoreToken, markCartConverted, upsertCart } from '@/features/cart/cart-sync';
import type { CartLine } from '@/features/cart/types';

const line: CartLine = { id: 'l1', productSlug: 'rose-hour', productName: 'Rose Hour', tone: '#bc6d63', unitPrice: 12000, quantity: 1, addOns: [], message: '', deliveryDate: '2026-08-20' };

function fakeClient(options: { existing?: unknown; insertError?: unknown; updateError?: unknown; deleteError?: unknown; row?: unknown } = {}) {
  const calls: Array<{ table: string; op: string; payload?: unknown }> = [];
  const client = {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          is: () => ({ maybeSingle: async () => ({ data: options.existing ?? null, error: null }) }),
          maybeSingle: async () => ({ data: options.row ?? null, error: null }),
        }),
      }),
      insert: (payload: unknown) => { calls.push({ table, op: 'insert', payload }); return { error: options.insertError ?? null }; },
      update: (payload: unknown) => { calls.push({ table, op: 'update', payload }); return { eq: () => ({ is: () => ({ error: options.updateError ?? null }), error: options.updateError ?? null }) }; },
      delete: () => { calls.push({ table, op: 'delete' }); return { eq: () => ({ is: () => ({ error: options.deleteError ?? null }) }) }; },
    }),
  };
  return { client, calls };
}

describe('upsertCart', () => {
  it('inserts a new cart with a fresh restore token', async () => {
    const { client, calls } = fakeClient();
    const result = await upsertCart(client, { email: 'a@b.com', locale: 'fr', city: 'cairo', lines: [line] });
    expect(result.status).toBe('ok');
    const insert = calls.find((c) => c.table === 'carts' && c.op === 'insert')?.payload as Record<string, unknown>;
    expect(insert.email).toBe('a@b.com');
    expect(insert.locale).toBe('fr');
    expect(insert.lines).toEqual([line]);
    expect(typeof insert.restore_token).toBe('string');
  });

  it('updates the existing active cart and refreshes the token', async () => {
    const { client, calls } = fakeClient({ existing: { id: 'c1' } });
    const result = await upsertCart(client, { email: 'a@b.com', locale: 'en', city: 'cairo', lines: [line] });
    expect(result.status).toBe('ok');
    const update = calls.find((c) => c.table === 'carts' && c.op === 'update')?.payload as Record<string, unknown>;
    expect(update.lines).toEqual([line]);
    expect(typeof update.restore_token).toBe('string');
  });

  it('deletes the active cart when the bag is emptied', async () => {
    const { client, calls } = fakeClient();
    const result = await upsertCart(client, { email: 'a@b.com', locale: 'en', city: 'cairo', lines: [] });
    expect(result.status).toBe('ok');
    expect(calls.some((c) => c.table === 'carts' && c.op === 'delete')).toBe(true);
  });

  it('rejects an invalid email', async () => {
    const { client } = fakeClient();
    expect(await upsertCart(client, { email: 'not-an-email', locale: 'en', city: 'cairo', lines: [line] })).toEqual({ status: 'invalid' });
  });

  it('rejects malformed lines', async () => {
    const { client } = fakeClient();
    expect(await upsertCart(client, { email: 'a@b.com', locale: 'en', city: 'cairo', lines: [{ id: 1 } as never] })).toEqual({ status: 'invalid' });
  });

  it('returns failure on an insert error', async () => {
    const { client } = fakeClient({ insertError: new Error('db down') });
    expect(await upsertCart(client, { email: 'a@b.com', locale: 'en', city: 'cairo', lines: [line] })).toEqual({ status: 'failure' });
  });
});

describe('markCartConverted', () => {
  it('stamps converted_at on the active cart', async () => {
    const { client, calls } = fakeClient();
    expect(await markCartConverted(client, { email: 'a@b.com' })).toEqual({ status: 'ok' });
    const update = calls.find((c) => c.table === 'carts' && c.op === 'update')?.payload as Record<string, unknown>;
    expect(typeof update.converted_at).toBe('string');
  });

  it('is a no-op for an empty email', async () => {
    const { client, calls } = fakeClient();
    expect(await markCartConverted(client, { email: '  ' })).toEqual({ status: 'ok' });
    expect(calls).toEqual([]);
  });
});

describe('getCartByRestoreToken', () => {
  it('returns the lines for a valid token', async () => {
    const { client } = fakeClient({ row: { lines: [line] } });
    expect(await getCartByRestoreToken(client, { token: 't1' })).toEqual({ status: 'ok', lines: [line] });
  });

  it('returns not_found for an unknown token', async () => {
    const { client } = fakeClient();
    expect(await getCartByRestoreToken(client, { token: 'missing' })).toEqual({ status: 'not_found' });
  });
});
