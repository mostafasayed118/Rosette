import { describe, expect, it } from 'vitest';
import { saveDeliveryRule, createCityWithRule } from '@/features/admin/delivery-actions';
import type { AdminRole } from '@/features/admin/authorization';

type Call = { table: string; op: string; payload?: unknown; id?: string };

function fakeClient(seed: { rule?: { city_code: string } | null; city?: { code: string } | null }) {
  const calls: Call[] = [];
  const from = (table: string) => ({
    select: () => ({ eq: (column: string, value: string) => ({ maybeSingle: async () => {
      if (table === 'delivery_rules') return { data: seed.rule ?? null, error: null };
      if (table === 'cities') return { data: seed.city ?? null, error: null };
      return { data: null, error: null };
    } }) }),
    insert: (payload: unknown) => {
      calls.push({ table, op: 'insert', payload });
      return { error: null };
    },
    update: (payload: unknown) => ({ eq: (value: string) => { calls.push({ table, op: 'update', payload, id: value }); return { error: null }; } }),
  });
  return { client: { from }, calls };
}

const admin = { userId: 'admin-1', role: 'admin' as const };
const operator = { userId: 'op-1', role: 'operator' as const };
const customer = { userId: 'c1', role: 'customer' as AdminRole };

const ruleInput = { cityCode: 'cairo', feeMinor: 7500, minimumOrderMinor: 0, cutoffHour: 14, active: true };

describe('saveDeliveryRule', () => {
  it('updates an existing rule and audits', async () => {
    const { client, calls } = fakeClient({ rule: { city_code: 'cairo' } });
    const result = await saveDeliveryRule(client, admin, ruleInput);
    expect(result).toBe('saved');
    const update = calls.find((c) => c.table === 'delivery_rules' && c.op === 'update');
    expect(update!.payload).toMatchObject({ fee_minor: 7500, cutoff_hour: 14, active: true });
    expect(calls.find((c) => c.table === 'admin_audit_logs')).toBeDefined();
  });

  it('lets an operator save', async () => {
    const { client, calls } = fakeClient({ rule: { city_code: 'cairo' } });
    expect(await saveDeliveryRule(client, operator, ruleInput)).toBe('saved');
    expect(calls.find((c) => c.table === 'admin_audit_logs')).toBeDefined();
  });

  it('inserts a rule when none exists', async () => {
    const { client, calls } = fakeClient({ rule: null });
    expect(await saveDeliveryRule(client, admin, ruleInput)).toBe('saved');
    expect(calls.find((c) => c.table === 'delivery_rules' && c.op === 'insert')).toBeDefined();
    expect(calls.find((c) => c.table === 'delivery_rules' && c.op === 'update')).toBeUndefined();
  });

  it('forbids a customer role without writes', async () => {
    const { client, calls } = fakeClient({});
    expect(await saveDeliveryRule(client, customer, ruleInput)).toBe('forbidden');
    expect(calls).toEqual([]);
  });

  it('rejects invalid fields without writes', async () => {
    const { client, calls } = fakeClient({});
    expect(await saveDeliveryRule(client, admin, { ...ruleInput, cutoffHour: 24 })).toBe('validation');
    expect(calls).toEqual([]);
  });
});

describe('createCityWithRule', () => {
  const cityInput = { code: 'luxor', nameEn: 'Luxor', nameAr: 'الأقصر', sameDay: false, feeMinor: 12000, minimumOrderMinor: 0, cutoffHour: 12 };

  it('creates a city with its rule and audits', async () => {
    const { client, calls } = fakeClient({ city: null });
    const result = await createCityWithRule(client, admin, cityInput);
    expect(result).toBe('created');
    expect(calls.find((c) => c.table === 'cities' && c.op === 'insert')).toBeDefined();
    const ruleInsert = calls.find((c) => c.table === 'delivery_rules' && c.op === 'insert');
    expect(ruleInsert!.payload).toMatchObject({ city_code: 'luxor', fee_minor: 12000, active: true });
    expect(calls.find((c) => c.table === 'admin_audit_logs' && (c.payload as { action: string }).action === 'create_city')).toBeDefined();
  });

  it('returns city_taken with no writes on duplicate code', async () => {
    const { client, calls } = fakeClient({ city: { code: 'luxor' } });
    expect(await createCityWithRule(client, operator, cityInput)).toBe('city_taken');
    expect(calls).toEqual([]);
  });

  it('rejects empty names without writes', async () => {
    const { client, calls } = fakeClient({});
    expect(await createCityWithRule(client, admin, { ...cityInput, nameEn: '  ' })).toBe('validation');
    expect(calls).toEqual([]);
  });

  it('forbids a customer role without writes', async () => {
    const { client, calls } = fakeClient({});
    expect(await createCityWithRule(client, customer, cityInput)).toBe('forbidden');
    expect(calls).toEqual([]);
  });
});
