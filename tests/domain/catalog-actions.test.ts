import { describe, expect, it } from 'vitest';
import { saveProduct, setInventory } from '@/features/admin/catalog-actions';
import type { AdminRole } from '@/features/admin/authorization';
import type { SaveProductInput } from '@/features/admin/catalog-validation';

type Call = { table: string; op: string; payload?: unknown; id?: string };
type InventoryRow = { variant_id: string; quantity: number; reserved_quantity: number };

function fakeClient(seed: { existingProduct?: { id: string; slug: string } | null; inventory?: Record<string, InventoryRow>; failInsert?: boolean }) {
  const calls: Call[] = [];
  const inventory = { ...(seed.inventory ?? {}) };
  let nextVariant = 1;
  const from = (table: string) => ({
    select: () => ({ eq: (column: string, value: string) => ({ maybeSingle: async () => {
      if (table === 'products') return { data: seed.existingProduct ?? null, error: null };
      if (table === 'inventory') return { data: inventory[value] ?? null, error: null };
      return { data: null, error: null };
    } }) }),
    insert: (payload: unknown) => {
      calls.push({ table, op: 'insert', payload });
      if (table === 'product_variants') return { select: () => ({ single: async () => ({ data: { id: `new-v${nextVariant++}` }, error: null }) }) };
      return { select: () => ({ single: async () => ({ data: { id: 'new-p1' }, error: null }) }) };
    },
    update: (payload: unknown) => ({ eq: (_column: string, value: string) => { calls.push({ table, op: 'update', payload, id: value }); return { error: null }; } }),
  });
  return { client: { from }, calls };
}

const admin = { userId: 'admin-1', role: 'admin' as const };
const operator = { userId: 'op-1', role: 'operator' as const };

const productInput: SaveProductInput = {
  nameEn: 'Rose Hour', nameAr: 'ساعة الورد', descriptionEn: 'Soft roses', descriptionAr: 'ورود ناعمة',
  category: 'hand-bouquet', occasions: ['birthday'], priceMinor: 12000, tone: '#bc6d63',
  delivery: 'Same-day', active: true,
  variants: [
    { nameEn: 'Classic', nameAr: 'كلاسيكي', priceDeltaMinor: 0, active: true, quantity: 5 },
    { nameEn: 'Generous', nameAr: 'سخي', priceDeltaMinor: 4500, active: true, quantity: 3 },
  ],
  addOns: [{ id: 'note', nameEn: 'Handwritten note', nameAr: 'بطاقة', priceMinor: 500 }],
};

describe('saveProduct', () => {
  it('creates a product with variants, stock, and audit', async () => {
    const { client, calls } = fakeClient({ existingProduct: null });
    const result = await saveProduct(client, admin, { mode: 'create', product: productInput });
    expect(result).toBe('saved');
    const productInsert = calls.find((c) => c.table === 'products' && c.op === 'insert');
    expect(productInsert!.payload).toMatchObject({ slug: 'rose-hour', price_minor: 12000, add_ons: [{ id: 'note', name_en: 'Handwritten note', name_ar: 'بطاقة', price_minor: 500 }] });
    expect(calls.filter((c) => c.table === 'product_variants' && c.op === 'insert')).toHaveLength(2);
    expect(calls.filter((c) => c.table === 'inventory' && c.op === 'insert')).toHaveLength(2);
    expect(calls.find((c) => c.table === 'admin_audit_logs')).toBeDefined();
  });

  it('returns slug_taken with no writes when the slug exists', async () => {
    const { client, calls } = fakeClient({ existingProduct: { id: 'p9', slug: 'rose-hour' } });
    const result = await saveProduct(client, admin, { mode: 'create', product: productInput });
    expect(result).toBe('slug_taken');
    expect(calls).toEqual([]);
  });

  it('updates an existing product, upserts variants and stock, and audits', async () => {
    const inventory = { 'v1': { variant_id: 'v1', quantity: 8, reserved_quantity: 1 } };
    const { client, calls } = fakeClient({ existingProduct: { id: 'p1', slug: 'rose-hour' }, inventory });
    const input: SaveProductInput = {
      ...productInput,
      variants: [
        { id: 'v1', nameEn: 'Classic', nameAr: 'كلاسيكي', priceDeltaMinor: 0, active: true, quantity: 7 },
        { nameEn: 'Deluxe', nameAr: 'ديلوكس', priceDeltaMinor: 6000, active: true, quantity: 2 },
      ],
    };
    const result = await saveProduct(client, admin, { mode: 'update', id: 'p1', product: input });
    expect(result).toBe('saved');
    expect(calls.find((c) => c.table === 'products' && c.op === 'update')).toBeDefined();
    expect(calls.find((c) => c.table === 'product_variants' && c.op === 'update' && c.id === 'v1')).toBeDefined();
    expect(calls.find((c) => c.table === 'product_variants' && c.op === 'insert')).toBeDefined();
    expect(calls.find((c) => c.table === 'inventory' && c.op === 'update' && c.id === 'v1')).toBeDefined();
    expect(calls.find((c) => c.table === 'admin_audit_logs' && (c.payload as { action: string }).action === 'update_product')).toBeDefined();
  });

  it('returns not_found when updating a missing product', async () => {
    const { client } = fakeClient({ existingProduct: null });
    const result = await saveProduct(client, admin, { mode: 'update', id: 'nope', product: productInput });
    expect(result).toBe('not_found');
  });

  it('returns validation without writes for bad input', async () => {
    const { client, calls } = fakeClient({ existingProduct: null });
    const result = await saveProduct(client, admin, { mode: 'create', product: { ...productInput, tone: 'red' } });
    expect(result).toBe('validation');
    expect(calls).toEqual([]);
  });

  it('rejects stock below reserved before writing', async () => {
    const inventory = { 'v1': { variant_id: 'v1', quantity: 8, reserved_quantity: 3 } };
    const { client, calls } = fakeClient({ existingProduct: { id: 'p1', slug: 'rose-hour' }, inventory });
    const input: SaveProductInput = { ...productInput, variants: [{ id: 'v1', nameEn: 'Classic', nameAr: 'كلاسيكي', priceDeltaMinor: 0, active: true, quantity: 2 }] };
    const result = await saveProduct(client, admin, { mode: 'update', id: 'p1', product: input });
    expect(result).toBe('validation');
    expect(calls.filter((c) => c.op === 'insert')).toEqual([]);
  });

  it('forbids operators', async () => {
    const { client, calls } = fakeClient({ existingProduct: null });
    const result = await saveProduct(client, operator, { mode: 'create', product: productInput });
    expect(result).toBe('forbidden');
    expect(calls).toEqual([]);
  });
});

describe('setInventory', () => {
  it('lets an operator set quantity on an existing row and audits', async () => {
    const inventory = { 'v1': { variant_id: 'v1', quantity: 8, reserved_quantity: 1 } };
    const { client, calls } = fakeClient({ inventory });
    const result = await setInventory(client, operator, { variantId: 'v1', quantity: 12 });
    expect(result).toBe('updated');
    const update = calls.find((c) => c.table === 'inventory' && c.op === 'update');
    expect(update).toBeDefined();
    expect(update!.payload).toMatchObject({ quantity: 12 });
    expect(calls.find((c) => c.table === 'admin_audit_logs')).toBeDefined();
  });

  it('inserts a row when none exists', async () => {
    const { client, calls } = fakeClient({});
    const result = await setInventory(client, admin, { variantId: 'v9', quantity: 4 });
    expect(result).toBe('updated');
    const insert = calls.find((c) => c.table === 'inventory' && c.op === 'insert');
    expect(insert!.payload).toMatchObject({ variant_id: 'v9', quantity: 4 });
  });

  it('rejects quantity below reserved without writes', async () => {
    const inventory = { 'v1': { variant_id: 'v1', quantity: 8, reserved_quantity: 3 } };
    const { client, calls } = fakeClient({ inventory });
    const result = await setInventory(client, admin, { variantId: 'v1', quantity: 2 });
    expect(result).toBe('validation');
    expect(calls.filter((c) => c.op === 'update' || c.op === 'insert')).toEqual([]);
  });

  it('rejects negative or fractional quantities', async () => {
    const { client, calls } = fakeClient({});
    expect(await setInventory(client, admin, { variantId: 'v1', quantity: -1 })).toBe('validation');
    expect(await setInventory(client, admin, { variantId: 'v1', quantity: 1.5 })).toBe('validation');
    expect(calls).toEqual([]);
  });

  it('forbids a customer role', async () => {
    const customer = { userId: 'c1', role: 'customer' as AdminRole };
    const { client, calls } = fakeClient({});
    const result = await setInventory(client, customer, { variantId: 'v1', quantity: 5 });
    expect(result).toBe('forbidden');
    expect(calls).toEqual([]);
  });
});
