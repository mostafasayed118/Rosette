import { describe, expect, it } from 'vitest';
import { savePromoCode, createPromoCode, type PromoInput } from '@/features/admin/promo-actions';
import type { AdminRole } from '@/features/admin/authorization';

type Call = { table: string; op: string; payload?: unknown; id?: string };

function fakeClient(seed: { existing?: { code: string } | null; failInsert?: boolean }) {
  const calls: Call[] = [];
  const from = (table: string) => ({
    select: () => ({ eq: (column: string, value: string) => ({ maybeSingle: async () => ({ data: seed.existing ?? null, error: null }) }) }),
    insert: (payload: unknown) => {
      calls.push({ table, op: 'insert', payload });
      return { error: seed.failInsert ? { message: 'insert failed' } : null };
    },
    update: (payload: unknown) => ({ eq: (value: string) => { calls.push({ table, op: 'update', payload, id: value }); return { error: null }; } }),
  });
  return { client: { from }, calls };
}

const admin = { userId: 'admin-1', role: 'admin' as const };
const operator = { userId: 'op-1', role: 'operator' as const };
const customer = { userId: 'c1', role: 'customer' as AdminRole };

const input: PromoInput = { code: 'ROSE10', type: 'percent', percentOff: 10, valueMinor: null, minimumOrderMinor: 0, startsAt: null, expiresAt: null, maxUses: 0, active: true };

function row(payload: Partial<Record<string, unknown>>) {
  return { ...input, ...payload } as PromoInput;
}

describe('savePromoCode', () => {
  it('updates an existing promo and audits', async () => {
    const { client, calls } = fakeClient({ existing: { code: 'ROSE10' } });
    const result = await savePromoCode(client, admin, row({ percentOff: 15 }));
    expect(result).toBe('saved');
    const update = calls.find((c) => c.table === 'promo_codes' && c.op === 'update');
    expect(update!.payload).toMatchObject({ percent_off: 15, active: true });
    expect(calls.find((c) => c.table === 'admin_audit_logs')).toBeDefined();
  });

  it('lets an operator save', async () => {
    const { client, calls } = fakeClient({ existing: { code: 'ROSE10' } });
    expect(await savePromoCode(client, operator, input)).toBe('saved');
    expect(calls.find((c) => c.table === 'admin_audit_logs')).toBeDefined();
  });

  it('rejects invalid input without writes', async () => {
    const { client, calls } = fakeClient({ existing: { code: 'ROSE10' } });
    expect(await savePromoCode(client, admin, row({ code: 'bad code!' }))).toBe('validation');
    expect(calls.filter((c) => c.op === 'update' || c.op === 'insert')).toEqual([]);
  });

  it('forbids a customer role without writes', async () => {
    const { client, calls } = fakeClient({ existing: { code: 'ROSE10' } });
    expect(await savePromoCode(client, customer, input)).toBe('forbidden');
    expect(calls).toEqual([]);
  });
});

describe('createPromoCode', () => {
  it('creates a promo and audits', async () => {
    const { client, calls } = fakeClient({ existing: null });
    const result = await createPromoCode(client, admin, input);
    expect(result).toBe('created');
    expect(calls.find((c) => c.table === 'promo_codes' && c.op === 'insert')).toBeDefined();
    expect(calls.find((c) => c.table === 'admin_audit_logs')).toBeDefined();
  });

  it('returns code_taken with no writes on duplicate', async () => {
    const { client, calls } = fakeClient({ existing: { code: 'ROSE10' } });
    expect(await createPromoCode(client, operator, input)).toBe('code_taken');
    expect(calls).toEqual([]);
  });

  it('rejects a percent code that also has a fixed value', async () => {
    const { client, calls } = fakeClient({ existing: null });
    expect(await createPromoCode(client, admin, row({ valueMinor: 1000 }))).toBe('validation');
    expect(calls).toEqual([]);
  });

  it('forbids a customer role without writes', async () => {
    const { client, calls } = fakeClient({ existing: null });
    expect(await createPromoCode(client, customer, input)).toBe('forbidden');
    expect(calls).toEqual([]);
  });
});
