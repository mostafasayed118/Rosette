import { describe, expect, it, vi, beforeEach } from 'vitest';
import { getCartByRestoreToken, markCartConverted, upsertCart } from '@/features/cart/cart-sync';
import type { CartLine } from '@/features/cart/types';

const line: CartLine = { id: 'l1', productSlug: 'rose-hour', productName: 'Rose Hour', tone: '#bc6d63', unitPrice: 12000, quantity: 1, addOns: [], message: '', deliveryDate: '2026-08-20' };

type RpcCall = { name: string; args: Record<string, unknown> };
type FromCall = { table: string; op: string; payload?: unknown };

function fakeClient(options: { existing?: unknown; row?: unknown; rpcError?: { message: string } | null; spyRpc?: boolean } = {}) {
  const fromCalls: FromCall[] = [];
  const rpcCalls: RpcCall[] = [];
  const client = {
    from: (table: string) => ({
      select: () => ({ eq: () => ({ is: () => ({ maybeSingle: async () => ({ data: options.row ?? null, error: null }) }), maybeSingle: async () => ({ data: options.row ?? null, error: null }) }) }),
      insert: (payload: unknown) => { fromCalls.push({ table, op: 'insert', payload }); return { error: null }; },
      update: (payload: unknown) => { fromCalls.push({ table, op: 'update', payload }); return { eq: () => ({ is: () => ({ error: null }) }) }; },
      delete: () => { fromCalls.push({ table, op: 'delete' }); return { eq: () => ({ is: () => ({ error: null }) }) }; },
    }),
    rpc: (name: string, args: Record<string, unknown>) => {
      if (options.spyRpc) rpcCalls.push({ name, args });
      return Promise.resolve({ data: null, error: options.rpcError ?? null });
    },
  };
  return { client, fromCalls, rpcCalls };
}

beforeEach(() => {
  vi.resetModules();
});

describe('upsertCart', () => {
  it('calls upsert_cart RPC with the validated lines and a fresh restore token', async () => {
    const { client, rpcCalls } = fakeClient({ spyRpc: true });
    const result = await upsertCart(client, { email: 'a@b.com', locale: 'fr', city: 'cairo', lines: [line] });
    expect(result.status).toBe('ok');
    expect(rpcCalls).toHaveLength(1);
    const call = rpcCalls[0]!;
    expect(call.name).toBe('upsert_cart');
    expect(call.args.p_email).toBe('a@b.com');
    expect(call.args.p_locale).toBe('fr');
    expect(call.args.p_city).toBe('cairo');
    expect(call.args.p_lines).toEqual([line]);
    expect(typeof call.args.p_restore_token).toBe('string');
    expect((call.args.p_restore_token as string).length).toBeGreaterThan(0);
  });

  it('returns failure when the RPC errors', async () => {
    const { client } = fakeClient({ rpcError: { message: 'db down' } });
    const result = await upsertCart(client, { email: 'a@b.com', locale: 'en', city: 'cairo', lines: [line] });
    expect(result.status).toBe('failure');
  });

  it('calls upsert_cart with empty lines when the bag is emptied', async () => {
    const { client, rpcCalls } = fakeClient({ spyRpc: true });
    const result = await upsertCart(client, { email: 'a@b.com', locale: 'en', city: 'cairo', lines: [] });
    expect(result.status).toBe('ok');
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0]!.args.p_lines).toEqual([]);
    expect(rpcCalls[0]!.args.p_restore_token).toBe('');
  });

  it('rejects an invalid email without calling the RPC', async () => {
    const { client, rpcCalls } = fakeClient({ spyRpc: true });
    const result = await upsertCart(client, { email: 'not-an-email', locale: 'en', city: 'cairo', lines: [line] });
    expect(result.status).toBe('invalid');
    expect(rpcCalls).toEqual([]);
  });

  it('rejects malformed lines without calling the RPC', async () => {
    const { client, rpcCalls } = fakeClient({ spyRpc: true });
    const result = await upsertCart(client, { email: 'a@b.com', locale: 'en', city: 'cairo', lines: [{ id: 1 } as never] });
    expect(result.status).toBe('invalid');
    expect(rpcCalls).toEqual([]);
  });

  it('passes the customer id to the RPC so the customer-scope branch runs in the database', async () => {
    const { client, rpcCalls } = fakeClient({ spyRpc: true });
    const result = await upsertCart(client, { email: 'a@b.com', customerId: 'cust-1', locale: 'en', city: 'cairo', lines: [line] });
    expect(result.status).toBe('ok');
    expect(rpcCalls[0]!.args.p_customer_id).toBe('cust-1');
  });

  it('passes a null customer id for guest writes so the customer-scope branch picks the anonymous path', async () => {
    const { client, rpcCalls } = fakeClient({ spyRpc: true });
    const result = await upsertCart(client, { email: 'a@b.com', customerId: null, locale: 'en', city: 'cairo', lines: [line] });
    expect(result.status).toBe('ok');
    expect(rpcCalls[0]!.args.p_customer_id).toBeNull();
  });
});

describe('markCartConverted', () => {
  it('stamps converted_at on the active cart', async () => {
    const { client, fromCalls } = fakeClient();
    expect(await markCartConverted(client, { email: 'a@b.com' })).toEqual({ status: 'ok' });
    const update = fromCalls.find((c) => c.table === 'carts' && c.op === 'update')?.payload as Record<string, unknown>;
    expect(typeof update.converted_at).toBe('string');
  });

  it('is a no-op for an empty email', async () => {
    const { client, fromCalls } = fakeClient();
    expect(await markCartConverted(client, { email: '  ' })).toEqual({ status: 'ok' });
    expect(fromCalls).toEqual([]);
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
