# Admin Catalog & Inventory Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins create and edit products (bilingual fields, category/occasion, price, tone, variants, add-ons) and let admins and operators adjust stock, via testable services and thin authorized routes behind server form pages.

**Architecture:** Pure validation + `slugify` in `catalog-validation.ts`; `saveProduct` (admin-only, atomic create/update incl. variants, add-ons, inventory) and `setInventory` (admin+operator) in `catalog-actions.ts`; thin `POST/PUT /api/admin/products*` and `POST /api/admin/inventory` routes; a shared client `ProductForm` on `/admin/products/new` and `/admin/products/[id]`; inline stock control on `/admin/inventory`.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Supabase (postgrest-js), Vitest, `@/` path alias.

**Spec:** `docs/superpowers/specs/2026-08-17-admin-catalog-editor-design.md`

## Global Constraints

- TypeScript strict; `npm run lint` runs `tsc --noEmit` and must pass.
- Vitest for tests; new tests live in `tests/domain/*.test.ts`; `@/` resolves to repo root.
- Money is in minor units (piasters); forms show EGP and convert ×100/÷100.
- Admin UI is English-only.
- Product/variant/add-on edits are admin-only; stock changes allowed for admin and operator.
- Variants are never hard-deleted: add, edit, or toggle `active`. Add-ons are replaced wholesale (jsonb). Products are deactivated via `active`, never deleted.
- Slugs are generated once from `name_en` on create and never change.
- Every save/adjust writes an `admin_audit_logs` row.
- No secrets in code or tests; tests use fakes only, never live services.
- TDD: failing test → run (red) → implement → run (green) → commit.
- All 69 existing tests stay passing.

---

### Task 1: Slugify and product validation

**Files:**
- Create: `features/admin/catalog-validation.ts`
- Test: `tests/domain/catalog-validation.test.ts`

**Interfaces:**
- Produces:
  - `CATEGORIES = ['hand-bouquet', 'vase-arrangement', 'plants', 'gift-boxes', 'sympathy']`
  - `OCCASIONS = ['birthday', 'love', 'thank-you', 'new-home', 'congratulations', 'sympathy']`
  - `slugify(input: string): string` — lowercase, runs of non-`[a-z0-9]` → `-`, trimmed of leading/trailing dashes.
  - `type SaveProductInput = { nameEn: string; nameAr: string; descriptionEn: string; descriptionAr: string; category: string; occasions: string[]; priceMinor: number; tone: string; delivery: string; active: boolean; variants: Array<{ id?: string; nameEn: string; nameAr: string; priceDeltaMinor: number; active: boolean; quantity: number }>; addOns: Array<{ id: string; nameEn: string; nameAr: string; priceMinor: number }> }`
  - `validateProductInput(input: SaveProductInput): string | null` — returns an error key or `null`. Keys: `names_required`, `slug_required`, `invalid_category`, `invalid_occasion`, `invalid_price`, `invalid_tone`, `invalid_delivery`, `variants_required`, `variant_name_required`, `invalid_variant_price`, `invalid_quantity`, `addon_required`, `invalid_addon_price`.

- [ ] **Step 1: Write the failing test**

`tests/domain/catalog-validation.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { slugify, validateProductInput, type SaveProductInput } from '@/features/admin/catalog-validation';

const base: SaveProductInput = {
  nameEn: 'Rose Hour', nameAr: 'ساعة الورد', descriptionEn: '', descriptionAr: '',
  category: 'hand-bouquet', occasions: ['birthday'], priceMinor: 12000, tone: '#bc6d63',
  delivery: 'Same-day', active: true,
  variants: [{ nameEn: 'Classic', nameAr: 'كلاسيكي', priceDeltaMinor: 0, active: true, quantity: 5 }],
  addOns: [],
};

describe('slugify', () => {
  it('lowercases and dashes spaces', () => {
    expect(slugify('Rose Hour')).toBe('rose-hour');
  });
  it('trims and collapses runs', () => {
    expect(slugify('  Little   Thanks  ')).toBe('little-thanks');
  });
  it('returns empty for non-ascii or empty input', () => {
    expect(slugify('ورد أحمر')).toBe('');
    expect(slugify('')).toBe('');
  });
});

describe('validateProductInput', () => {
  it('accepts a valid product', () => {
    expect(validateProductInput(base)).toBeNull();
  });
  it('rejects missing names and unslugifiable nameEn', () => {
    expect(validateProductInput({ ...base, nameEn: '' })).toBe('names_required');
    expect(validateProductInput({ ...base, nameEn: 'ورد' })).toBe('slug_required');
  });
  it('rejects unknown category or occasions', () => {
    expect(validateProductInput({ ...base, category: 'bogus' })).toBe('invalid_category');
    expect(validateProductInput({ ...base, occasions: ['bogus'] })).toBe('invalid_occasion');
  });
  it('rejects bad price, tone, delivery', () => {
    expect(validateProductInput({ ...base, priceMinor: -1 })).toBe('invalid_price');
    expect(validateProductInput({ ...base, tone: 'red' })).toBe('invalid_tone');
    expect(validateProductInput({ ...base, delivery: '  ' })).toBe('invalid_delivery');
  });
  it('rejects missing variants and bad variant fields', () => {
    expect(validateProductInput({ ...base, variants: [] })).toBe('variants_required');
    expect(validateProductInput({ ...base, variants: [{ ...base.variants[0], nameEn: '' }] })).toBe('variant_name_required');
    expect(validateProductInput({ ...base, variants: [{ ...base.variants[0], quantity: -2 }] })).toBe('invalid_quantity');
  });
  it('rejects bad add-ons', () => {
    expect(validateProductInput({ ...base, addOns: [{ id: '', nameEn: 'Note', nameAr: '', priceMinor: 500 }] })).toBe('addon_required');
    expect(validateProductInput({ ...base, addOns: [{ id: 'note', nameEn: 'Note', nameAr: '', priceMinor: -1 }] })).toBe('invalid_addon_price');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/domain/catalog-validation.test.ts`
Expected: FAIL — module `@/features/admin/catalog-validation` not found.

- [ ] **Step 3: Implement**

`features/admin/catalog-validation.ts`:

```ts
export const CATEGORIES = ['hand-bouquet', 'vase-arrangement', 'plants', 'gift-boxes', 'sympathy'];
export const OCCASIONS = ['birthday', 'love', 'thank-you', 'new-home', 'congratulations', 'sympathy'];
const TONE_PATTERN = /^#[0-9a-f]{6}$/i;

export type SaveProductInput = {
  nameEn: string; nameAr: string; descriptionEn: string; descriptionAr: string;
  category: string; occasions: string[]; priceMinor: number; tone: string; delivery: string; active: boolean;
  variants: Array<{ id?: string; nameEn: string; nameAr: string; priceDeltaMinor: number; active: boolean; quantity: number }>;
  addOns: Array<{ id: string; nameEn: string; nameAr: string; priceMinor: number }>;
};

export function slugify(input: string): string {
  return input.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export function validateProductInput(input: SaveProductInput): string | null {
  if (!input.nameEn.trim() || !input.nameAr.trim()) return 'names_required';
  if (!slugify(input.nameEn)) return 'slug_required';
  if (!CATEGORIES.includes(input.category)) return 'invalid_category';
  if (!input.occasions.every((occasion) => OCCASIONS.includes(occasion))) return 'invalid_occasion';
  if (!Number.isInteger(input.priceMinor) || input.priceMinor < 0) return 'invalid_price';
  if (!TONE_PATTERN.test(input.tone)) return 'invalid_tone';
  if (!input.delivery.trim()) return 'invalid_delivery';
  if (!input.variants.length) return 'variants_required';
  for (const variant of input.variants) {
    if (!variant.nameEn.trim()) return 'variant_name_required';
    if (!Number.isInteger(variant.priceDeltaMinor)) return 'invalid_variant_price';
    if (!Number.isInteger(variant.quantity) || variant.quantity < 0) return 'invalid_quantity';
  }
  for (const addOn of input.addOns) {
    if (!addOn.id.trim() || !addOn.nameEn.trim()) return 'addon_required';
    if (!Number.isInteger(addOn.priceMinor) || addOn.priceMinor < 0) return 'invalid_addon_price';
  }
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/domain/catalog-validation.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add features/admin/catalog-validation.ts tests/domain/catalog-validation.test.ts
git commit -m "feat: add product validation and slugify helpers"
```

---

### Task 2: `saveProduct` service

**Files:**
- Create: `features/admin/catalog-actions.ts`
- Test: `tests/domain/catalog-actions.test.ts`

**Interfaces:**
- Consumes: `slugify`, `validateProductInput`, `SaveProductInput` (Task 1); `AdminIdentity` from `@/features/admin/authorization`.
- Produces:
  - `type SaveProductResult = 'saved' | 'not_found' | 'validation' | 'slug_taken' | 'forbidden' | 'failure'`
  - `saveProduct(client, admin, input: { mode: 'create' | 'update'; id?: string; product: SaveProductInput }): Promise<SaveProductResult>`
  - Behavior: non-admin → `'forbidden'`; `validateProductInput` fail → `'validation'`. Create: slug from `nameEn`, duplicate → `'slug_taken'`, then insert product → insert each variant (capturing id) → upsert inventory per variant → audit `create_product`. Update: fetch product by id (missing → `'not_found'`), stock pre-check (existing inventory with `quantity < reserved_quantity` → `'validation'`, before any write), update product fields, upsert variants by id / insert new ones, upsert inventory per variant, audit `update_product`. Any DB error or throw → `'failure'`.

- [ ] **Step 1: Write the failing test**

`tests/domain/catalog-actions.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { saveProduct } from '@/features/admin/catalog-actions';
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
    update: (payload: unknown) => ({ eq: (id: string) => { calls.push({ table, op: 'update', payload, id }); return { error: null }; } }),
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/domain/catalog-actions.test.ts`
Expected: FAIL — module `@/features/admin/catalog-actions` not found.

- [ ] **Step 3: Implement**

`features/admin/catalog-actions.ts`:

```ts
import type { AdminIdentity } from './authorization';
import { slugify, validateProductInput, type SaveProductInput } from './catalog-validation';

export type SaveProductResult = 'saved' | 'not_found' | 'validation' | 'slug_taken' | 'forbidden' | 'failure';

type CatalogClient = { from: (table: string) => any };

export async function saveProduct(
  client: CatalogClient,
  admin: AdminIdentity,
  input: { mode: 'create' | 'update'; id?: string; product: SaveProductInput },
): Promise<SaveProductResult> {
  if (admin.role !== 'admin') return 'forbidden';
  if (validateProductInput(input.product)) return 'validation';

  try {
    if (input.mode === 'create') {
      const slug = slugify(input.product.nameEn);
      const { data: existing } = await client.from('products').select('slug').eq('slug', slug).maybeSingle();
      if (existing) return 'slug_taken';
      const { data: created, error } = await client.from('products').insert(toProductRow(slug, input.product)).select('id').single();
      if (error || !created) return 'failure';
      for (const variant of input.product.variants) {
        const variantId = await insertVariant(client, created.id, variant);
        await setStock(client, variantId, variant.quantity);
      }
      await audit(client, admin, 'create_product', created.id, { slug });
      return 'saved';
    }

    const { data: product } = await client.from('products').select('id,slug').eq('id', input.id).maybeSingle();
    if (!product) return 'not_found';
    for (const variant of input.product.variants) {
      if (!variant.id) continue;
      const { data: stockRow } = await client.from('inventory').select('variant_id,reserved_quantity').eq('variant_id', variant.id).maybeSingle();
      if (stockRow && variant.quantity < stockRow.reserved_quantity) return 'validation';
    }
    const { error: updateError } = await client.from('products').update(toProductRow(product.slug, input.product)).eq('id', input.id);
    if (updateError) return 'failure';
    for (const variant of input.product.variants) {
      if (variant.id) {
        await client.from('product_variants').update({ name_en: variant.nameEn, name_ar: variant.nameAr, price_delta_minor: variant.priceDeltaMinor, active: variant.active }).eq('id', variant.id);
        await setStock(client, variant.id, variant.quantity);
      } else {
        const variantId = await insertVariant(client, input.id as string, variant);
        await setStock(client, variantId, variant.quantity);
      }
    }
    await audit(client, admin, 'update_product', input.id as string, {});
    return 'saved';
  } catch {
    return 'failure';
  }
}

function toProductRow(slug: string, input: SaveProductInput) {
  return {
    slug,
    name_en: input.nameEn,
    name_ar: input.nameAr,
    description_en: input.descriptionEn,
    description_ar: input.descriptionAr,
    category: input.category,
    occasions: input.occasions,
    price_minor: input.priceMinor,
    tone: input.tone,
    delivery: input.delivery,
    active: input.active,
    add_ons: input.addOns.map((addOn) => ({ id: addOn.id, name_en: addOn.nameEn, name_ar: addOn.nameAr, price_minor: addOn.priceMinor })),
  };
}

async function insertVariant(client: CatalogClient, productId: string, variant: SaveProductInput['variants'][number]) {
  const { data, error } = await client.from('product_variants').insert({ product_id: productId, name_en: variant.nameEn, name_ar: variant.nameAr, price_delta_minor: variant.priceDeltaMinor, active: variant.active }).select('id').single();
  if (error || !data) throw new Error('variant insert failed');
  return data.id;
}

async function setStock(client: CatalogClient, variantId: string, quantity: number) {
  const { data: row } = await client.from('inventory').select('variant_id,reserved_quantity').eq('variant_id', variantId).maybeSingle();
  if (row) {
    const { error } = await client.from('inventory').update({ quantity, updated_at: new Date().toISOString() }).eq('variant_id', variantId);
    if (error) throw new Error('stock update failed');
  } else {
    const { error } = await client.from('inventory').insert({ variant_id: variantId, quantity });
    if (error) throw new Error('stock insert failed');
  }
}

async function audit(client: CatalogClient, admin: AdminIdentity, action: string, targetId: string, metadata: Record<string, unknown>) {
  await client.from('admin_audit_logs').insert({ actor_id: admin.userId, action, target_type: 'product', target_id: targetId, metadata });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/domain/catalog-actions.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add features/admin/catalog-actions.ts tests/domain/catalog-actions.test.ts
git commit -m "feat: add saveProduct service for catalog creation and edits"
```

---

### Task 3: `setInventory` service

**Files:**
- Modify: `features/admin/catalog-actions.ts` (append `setInventory`)
- Modify: `tests/domain/catalog-actions.test.ts` (append `setInventory` describe block)

**Interfaces:**
- Consumes: `AdminIdentity` from `@/features/admin/authorization`; `CatalogClient` type (Task 2).
- Produces:
  - `type SetInventoryResult = 'updated' | 'forbidden' | 'validation' | 'failure'`
  - `setInventory(client, admin, input: { variantId: string; quantity: number }): Promise<SetInventoryResult>`
  - Behavior: role must be `admin` or `operator`; `quantity` must be a non-negative integer; if the inventory row exists and `quantity < reserved_quantity` → `'validation'`; otherwise update the row (or insert when missing) with `updated_at`; audit `update_inventory`; any error → `'failure'`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/domain/catalog-actions.test.ts` (the fake client from Task 2 is already in scope):

```ts
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
    const customer = { userId: 'c1', role: 'customer' as const };
    const { client, calls } = fakeClient({});
    const result = await setInventory(client, customer, { variantId: 'v1', quantity: 5 });
    expect(result).toBe('forbidden');
    expect(calls).toEqual([]);
  });
});
```

Also add `setInventory` to the import at the top of the test file:

```ts
import { saveProduct, setInventory } from '@/features/admin/catalog-actions';
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/domain/catalog-actions.test.ts`
Expected: FAIL — `setInventory` is not exported.

- [ ] **Step 3: Implement**

Append to `features/admin/catalog-actions.ts`:

```ts
export type SetInventoryResult = 'updated' | 'forbidden' | 'validation' | 'failure';

export async function setInventory(
  client: CatalogClient,
  admin: AdminIdentity,
  input: { variantId: string; quantity: number },
): Promise<SetInventoryResult> {
  if (admin.role !== 'admin' && admin.role !== 'operator') return 'forbidden';
  if (!Number.isInteger(input.quantity) || input.quantity < 0) return 'validation';
  try {
    const { data: row } = await client.from('inventory').select('variant_id,reserved_quantity').eq('variant_id', input.variantId).maybeSingle();
    if (row && input.quantity < row.reserved_quantity) return 'validation';
    if (row) {
      const { error } = await client.from('inventory').update({ quantity: input.quantity, updated_at: new Date().toISOString() }).eq('variant_id', input.variantId);
      if (error) return 'failure';
    } else {
      const { error } = await client.from('inventory').insert({ variant_id: input.variantId, quantity: input.quantity });
      if (error) return 'failure';
    }
    await client.from('admin_audit_logs').insert({ actor_id: admin.userId, action: 'update_inventory', target_type: 'inventory', target_id: input.variantId, metadata: { quantity: input.quantity } });
    return 'updated';
  } catch {
    return 'failure';
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/domain/catalog-actions.test.ts`
Expected: PASS (12 tests — 7 from Task 2 + 5 new).

- [ ] **Step 5: Commit**

```bash
git add features/admin/catalog-actions.ts tests/domain/catalog-actions.test.ts
git commit -m "feat: add setInventory service"
```

---

### Task 4: Thin API routes

**Files:**
- Create: `app/api/admin/products/route.ts`
- Create: `app/api/admin/products/[id]/route.ts`
- Create: `app/api/admin/inventory/route.ts`

**Interfaces:**
- Consumes: `saveProduct`, `setInventory` (Tasks 2–3); `getCurrentAdmin` from `@/features/auth/server`; `getAdminSupabase` from `@/lib/supabase/admin`; `SaveProductInput` type (Task 1).
- Produces:
  - `POST /api/admin/products` — body `{ product: SaveProductInput }`; 403 no admin, 400 invalid body/validation, 409 slug_taken, 500 failure, 201 `{ ok: true }`.
  - `PUT /api/admin/products/[id]` — body `{ product: SaveProductInput }`; 404 not_found; 200 on success.
  - `POST /api/admin/inventory` — body `{ variantId, quantity }`; 200 on success.

- [ ] **Step 1: Create the products create route**

`app/api/admin/products/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { saveProduct } from '@/features/admin/catalog-actions';
import type { SaveProductInput } from '@/features/admin/catalog-validation';
import { getCurrentAdmin } from '@/features/auth/server';
import { getAdminSupabase } from '@/lib/supabase/admin';

export async function POST(request: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Admin authorization required' }, { status: 403 });
  const body = (await request.json()) as { product?: unknown };
  if (!body.product || typeof body.product !== 'object') return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  const result = await saveProduct(getAdminSupabase(), admin, { mode: 'create', product: body.product as SaveProductInput });
  if (result === 'forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (result === 'validation') return NextResponse.json({ error: 'Invalid product data' }, { status: 400 });
  if (result === 'slug_taken') return NextResponse.json({ error: 'Slug already in use' }, { status: 409 });
  if (result === 'failure') return NextResponse.json({ error: 'Could not save product' }, { status: 500 });
  return NextResponse.json({ ok: true }, { status: 201 });
}
```

- [ ] **Step 2: Create the products update route**

`app/api/admin/products/[id]/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { saveProduct } from '@/features/admin/catalog-actions';
import type { SaveProductInput } from '@/features/admin/catalog-validation';
import { getCurrentAdmin } from '@/features/auth/server';
import { getAdminSupabase } from '@/lib/supabase/admin';

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Admin authorization required' }, { status: 403 });
  const { id } = await context.params;
  const body = (await request.json()) as { product?: unknown };
  if (!body.product || typeof body.product !== 'object') return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  const result = await saveProduct(getAdminSupabase(), admin, { mode: 'update', id, product: body.product as SaveProductInput });
  if (result === 'forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (result === 'validation') return NextResponse.json({ error: 'Invalid product data' }, { status: 400 });
  if (result === 'not_found') return NextResponse.json({ error: 'Product not found' }, { status: 404 });
  if (result === 'failure') return NextResponse.json({ error: 'Could not save product' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Create the inventory route**

`app/api/admin/inventory/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { setInventory } from '@/features/admin/catalog-actions';
import { getCurrentAdmin } from '@/features/auth/server';
import { getAdminSupabase } from '@/lib/supabase/admin';

export async function POST(request: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Admin authorization required' }, { status: 403 });
  const body = (await request.json()) as { variantId?: unknown; quantity?: unknown };
  if (typeof body.variantId !== 'string' || typeof body.quantity !== 'number') return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  const result = await setInventory(getAdminSupabase(), admin, { variantId: body.variantId, quantity: body.quantity });
  if (result === 'forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (result === 'validation') return NextResponse.json({ error: 'Invalid quantity' }, { status: 400 });
  if (result === 'failure') return NextResponse.json({ error: 'Could not update inventory' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Verify typecheck and build**

Run: `npm run lint && npm run build`
Expected: both pass; the three routes appear in the build output.

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/products/route.ts app/api/admin/products/[id]/route.ts app/api/admin/inventory/route.ts
git commit -m "feat: add admin product and inventory API routes"
```

---

### Task 5: Product form, pages, and inventory control

**Files:**
- Create: `components/admin/ProductForm.tsx`
- Create: `app/admin/products/new/page.tsx`
- Create: `app/admin/products/[id]/page.tsx`
- Modify: `app/admin/products/page.tsx` (edit links + "New product")
- Create: `components/admin/SetQuantityForm.tsx`
- Modify: `app/admin/inventory/page.tsx` (inline stock control)

**Interfaces:**
- Consumes: `SaveProductInput` (Task 1); `CATEGORIES`, `OCCASIONS` (Task 1); `getCurrentAdmin`; `getAdminSupabase`.
- Produces:
  - `type ProductFormInitial = SaveProductInput & { id: string }`
  - `ProductForm({ initial }: { initial?: ProductFormInitial })` client component — full form; submit POSTs `{ product }` to `/api/admin/products` (create) or PUTs to `/api/admin/products/[id]` (edit, using `initial.id`); on success `router.push('/admin/products')`; inline error otherwise.
  - `SetQuantityForm({ variantId, current }: { variantId: string; current: number })` client component — number input + button; POSTs `{ variantId, quantity }` to `/api/admin/inventory`; `router.refresh()` on success; inline error otherwise.

- [ ] **Step 1: Implement `ProductForm`**

`components/admin/ProductForm.tsx`:

```tsx
'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { CATEGORIES, OCCASIONS, type SaveProductInput } from '@/features/admin/catalog-validation';

export type ProductFormInitial = SaveProductInput & { id: string };

type VariantEntry = SaveProductInput['variants'][number];
type AddOnEntry = SaveProductInput['addOns'][number];

const emptyVariant = (): VariantEntry => ({ nameEn: '', nameAr: '', priceDeltaMinor: 0, active: true, quantity: 0 });
const emptyAddOn = (): AddOnEntry => ({ id: '', nameEn: '', nameAr: '', priceMinor: 0 });

function toMinor(egp: string): number {
  const parsed = Number.parseFloat(egp);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

function minorToEgp(minor: number): string {
  return (minor / 100).toFixed(2);
}

export function ProductForm({ initial }: { initial?: ProductFormInitial }) {
  const router = useRouter();
  const [product, setProduct] = useState<SaveProductInput>(initial ?? {
    nameEn: '', nameAr: '', descriptionEn: '', descriptionAr: '', category: CATEGORIES[0], occasions: [],
    priceMinor: 0, tone: '#bc6d63', delivery: 'Next-day delivery', active: true,
    variants: [emptyVariant()], addOns: [],
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function patch(p: Partial<SaveProductInput>) { setProduct((current) => ({ ...current, ...p })); }
  function updateVariant(index: number, patchValue: Partial<VariantEntry>) {
    setProduct((current) => ({ ...current, variants: current.variants.map((v, i) => (i === index ? { ...v, ...patchValue } : v)) }));
  }
  function updateAddOn(index: number, patchValue: Partial<AddOnEntry>) {
    setProduct((current) => ({ ...current, addOns: current.addOns.map((a, i) => (i === index ? { ...a, ...patchValue } : a)) }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    const response = initial
      ? await fetch(`/api/admin/products/${initial.id ?? ''}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ product }) })
      : await fetch('/api/admin/products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ product }) });
    if (!response.ok) {
      setError('Could not save the product. Check the fields and try again.');
      setSaving(false);
      return;
    }
    router.push('/admin/products');
    router.refresh();
  }

  return <form className="checkout-form" onSubmit={submit} noValidate>
    {error ? <div className="status-message" role="alert"><strong>{error}</strong></div> : null}

    <section className="form-section"><p className="eyebrow">Identity</p><div className="form-grid">
      <Field id="nameEn" label="Name (EN)" value={product.nameEn} onChange={(e) => patch({ nameEn: e.target.value })} required />
      <Field id="nameAr" label="Name (AR)" value={product.nameAr} onChange={(e) => patch({ nameAr: e.target.value })} required />
      <Field id="descriptionEn" label="Description (EN)" className="span-two" value={product.descriptionEn} onChange={(e) => patch({ descriptionEn: e.target.value })} />
      <Field id="descriptionAr" label="Description (AR)" className="span-two" value={product.descriptionAr} onChange={(e) => patch({ descriptionAr: e.target.value })} />
    </div></section>

    <section className="form-section"><p className="eyebrow">Catalog</p><div className="form-grid">
      <label className="field"><span>Category</span><select value={product.category} onChange={(e) => patch({ category: e.target.value })}>{CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
      <label className="field"><span>Price (EGP)</span><input type="number" min="0" step="0.01" value={minorToEgp(product.priceMinor)} onChange={(e) => patch({ priceMinor: toMinor(e.target.value) })} required /></label>
      <label className="field"><span>Tone (hex)</span><input type="text" pattern="#[0-9a-fA-F]{6}" value={product.tone} onChange={(e) => patch({ tone: e.target.value })} required /></label>
      <label className="field"><span>Delivery copy</span><input type="text" value={product.delivery} onChange={(e) => patch({ delivery: e.target.value })} required /></label>
      <fieldset className="span-two"><legend>Occasions</legend>{OCCASIONS.map((o) => <label className="choice" key={o}><input type="checkbox" checked={product.occasions.includes(o)} onChange={(e) => patch({ occasions: e.target.checked ? [...product.occasions, o] : product.occasions.filter((x) => x !== o) })} /><span>{o}</span></label>)}</fieldset>
      <label className="choice span-two"><input type="checkbox" checked={product.active} onChange={(e) => patch({ active: e.target.checked })} /><span>Active (visible in shop)</span></label>
    </div></section>

    <section className="form-section"><p className="eyebrow">Variants &amp; stock</p>
      {product.variants.map((variant, index) => (
        <div className="form-grid" key={variant.id ?? `new-${index}`}>
          <Field id={`variant-en-${index}`} label="Variant (EN)" value={variant.nameEn} onChange={(e) => updateVariant(index, { nameEn: e.target.value })} required />
          <Field id={`variant-ar-${index}`} label="Variant (AR)" value={variant.nameAr} onChange={(e) => updateVariant(index, { nameAr: e.target.value })} />
          <Field id={`variant-delta-${index}`} label="Price delta (EGP)" type="number" step="0.01" value={minorToEgp(variant.priceDeltaMinor)} onChange={(e) => updateVariant(index, { priceDeltaMinor: toMinor(e.target.value) })} />
          <Field id={`variant-qty-${index}`} label="Stock" type="number" min="0" value={String(variant.quantity)} onChange={(e) => updateVariant(index, { quantity: Math.max(0, Number.parseInt(e.target.value || '0', 10)) })} />
          <label className="choice"><input type="checkbox" checked={variant.active} onChange={(e) => updateVariant(index, { active: e.target.checked })} /><span>Active</span></label>
          {!variant.id ? <Button type="button" onClick={() => setProduct((current) => ({ ...current, variants: current.variants.filter((_, i) => i !== index) }))}>Remove</Button> : null}
        </div>
      ))}
      <Button type="button" onClick={() => patch({ variants: [...product.variants, emptyVariant()] })}>Add variant</Button>
    </section>

    <section className="form-section"><p className="eyebrow">Add-ons</p>
      {product.addOns.map((addOn, index) => (
        <div className="form-grid" key={index}>
          <Field id={`addon-id-${index}`} label="Key (id)" value={addOn.id} onChange={(e) => updateAddOn(index, { id: e.target.value })} required />
          <Field id={`addon-en-${index}`} label="Name (EN)" value={addOn.nameEn} onChange={(e) => updateAddOn(index, { nameEn: e.target.value })} required />
          <Field id={`addon-ar-${index}`} label="Name (AR)" value={addOn.nameAr} onChange={(e) => updateAddOn(index, { nameAr: e.target.value })} />
          <Field id={`addon-price-${index}`} label="Price (EGP)" type="number" step="0.01" value={minorToEgp(addOn.priceMinor)} onChange={(e) => updateAddOn(index, { priceMinor: toMinor(e.target.value) })} />
          <Button type="button" onClick={() => setProduct((current) => ({ ...current, addOns: current.addOns.filter((_, i) => i !== index) }))}>Remove</Button>
        </div>
      ))}
      <Button type="button" onClick={() => patch({ addOns: [...product.addOns, emptyAddOn()] })}>Add add-on</Button>
    </section>

    <Button type="submit" disabled={saving}>{saving ? 'Saving…' : initial ? 'Save product' : 'Create product'}</Button>
  </form>;
}
```

The edit page builds `initial` as `SaveProductInput & { id: string }` (Task 5 Step 2); the form uses `initial.id` only to build the PUT URL.

- [ ] **Step 2: Create the new and edit pages**

`app/admin/products/new/page.tsx`:

```tsx
import { redirect } from 'next/navigation';
import { ProductForm } from '@/components/admin/ProductForm';
import { getCurrentAdmin } from '@/features/auth/server';

export default async function NewProductPage() {
  const admin = await getCurrentAdmin();
  if (!admin) redirect('/login');
  return <main className="content-frame"><p className="eyebrow">Catalog operations</p><h1>New product</h1><ProductForm /></main>;
}
```

`app/admin/products/[id]/page.tsx`:

```tsx
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ProductForm, type ProductFormInitial } from '@/components/admin/ProductForm';
import { getCurrentAdmin } from '@/features/auth/server';
import { getAdminSupabase } from '@/lib/supabase/admin';

type VariantRow = { id: string; name_en: string; name_ar: string; price_delta_minor: number; active: boolean; inventory?: Array<{ quantity: number; reserved_quantity: number }> };

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) redirect('/login');
  const { id } = await params;
  const { data } = await getAdminSupabase().from('products').select('*,product_variants(*,inventory(quantity,reserved_quantity))').eq('id', id).maybeSingle();
  if (!data) return <main className="content-frame"><h1>Product not found</h1><p><Link href="/admin/products">Back to products</Link></p></main>;

  const initial: ProductFormInitial = {
    id,
    nameEn: data.name_en, nameAr: data.name_ar, descriptionEn: data.description_en, descriptionAr: data.description_ar,
    category: data.category, occasions: data.occasions, priceMinor: data.price_minor, tone: data.tone,
    delivery: data.delivery, active: data.active,
    variants: ((data.product_variants ?? []) as VariantRow[]).map((variant) => ({
      id: variant.id, nameEn: variant.name_en, nameAr: variant.name_ar,
      priceDeltaMinor: variant.price_delta_minor, active: variant.active,
      quantity: variant.inventory?.[0]?.quantity ?? 0,
    })),
    addOns: ((data.add_ons ?? []) as Array<{ id: string; name_en: string; name_ar: string; price_minor: number }>).map((addOn) => ({ id: addOn.id, nameEn: addOn.name_en, nameAr: addOn.name_ar, priceMinor: addOn.price_minor })),
  };
  return <main className="content-frame"><p className="eyebrow">Catalog operations</p><h1>{data.name_en}</h1><ProductForm initial={initial} /></main>;
}
```

- [ ] **Step 3: Add links to the products list**

In `app/admin/products/page.tsx`, replace the row rendering and heading so each product links to its edit page and a "New product" button links to `/admin/products/new`. Concretely:

```tsx
import Link from 'next/link';
// ...existing imports...
// inside the returned JSX, replace:
//   <article className="status-message" key={product.id}><strong>{product.name_en}</strong>...
// with:
//   <article className="status-message" key={product.id}><Link href={`/admin/products/${product.id}`}><strong>{product.name_en}</strong></Link>...
// and add above the list:
//   <p><Link className="button" href="/admin/products/new">New product</Link></p>
```

Apply the same edit-link pattern by editing the file directly (keep the existing query and row fields).

- [ ] **Step 4: Implement `SetQuantityForm` and wire it into the inventory page**

`components/admin/SetQuantityForm.tsx`:

```tsx
'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

export function SetQuantityForm({ variantId, current }: { variantId: string; current: number }) {
  const router = useRouter();
  const [value, setValue] = useState(String(current));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    const quantity = Number.parseInt(value, 10);
    const response = await fetch('/api/admin/inventory', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ variantId, quantity }) });
    if (!response.ok) {
      setError('Could not update stock.');
      setSaving(false);
      return;
    }
    router.refresh();
  }

  return <form className="quantity-control" onSubmit={submit}>
    <input type="number" min="0" value={value} onChange={(e) => setValue(e.target.value)} aria-label="Set quantity" />
    <button className="button" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Set'}</button>
    {error ? <small className="field-error">{error}</small> : null}
  </form>;
}
```

In `app/admin/inventory/page.tsx`, import `SetQuantityForm` and render it per row alongside the existing available/reserved text:

```tsx
// after the existing <span>... available · ... reserved</span>:
<SetQuantityForm variantId={row.variant_id} current={row.quantity} />
```

- [ ] **Step 5: Verify typecheck and build**

Run: `npm run lint && npm run build`
Expected: both pass; `/admin/products/new` and `/admin/products/[id]` appear in the build output.

- [ ] **Step 6: Commit**

```bash
git add components/admin/ProductForm.tsx components/admin/SetQuantityForm.tsx app/admin/products app/admin/inventory/page.tsx
git commit -m "feat: add product editor pages and inventory stock control"
```

---

### Task 6: Final verification

- [ ] **Step 1: Run the full gate**

Run: `npm test && npm run lint && npm run build && git diff --check`
Expected: all tests pass (69 existing + 15 new = 84), tsc clean, build succeeds, no whitespace errors.

- [ ] **Step 2: Secret scan**

Run: `npm test -- tests/security/no-secrets.test.ts`
Expected: PASS — the repository secret scan covers all `ts/tsx/js/mjs/json/md/env/sql/css` files.

- [ ] **Step 3: Commit any stragglers**

```bash
git status --short
git add -A
git commit -m "chore: final admin catalog editor verification" || echo "nothing to commit"
```
