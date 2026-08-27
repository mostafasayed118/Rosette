# Multi-Recipient Cart Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let one checkout deliver multiple bouquet lines to different recipients, each with its own address, date, time window, and per-group delivery fee — while keeping the existing single-recipient path byte-identical.

**Architecture:** The cart gains a top-level `recipients` array; each cart line optionally carries a `recipientId`. One order holds one or more `order_delivery_groups` rows; `order_items` reference a group via `delivery_group_id`. The `create_pending_order` RPC is extended with a nullable `p_groups` jsonb array. Per-group fulfillment status drives a derived order-level status, and each group gets its own public tracking token. Existing single-recipient orders create no group rows and behave exactly as before.

**Tech Stack:** Next.js 16 (App Router), Supabase/Postgres raw SQL migrations, React Context cart (localStorage), Vitest + Testing Library, i18n via `features/i18n` JSON dictionaries.

**Spec:** `docs/superpowers/specs/2026-08-27-multi-recipient-cart-design.md` — the plan argues from this spec; executors read both.

## Global Constraints

- Single city per order: recipients never carry a city; the checkout `[city]` URL segment governs the whole order.
- Delivery fee = the city's flat `delivery_rules.fee_minor` × maximum(1, recipient-group count).
- Legacy single-recipient behavior must stay byte-identical: no group rows are created and `orders.delivery_*` is populated from the legacy `p_checkout` fields.
- Max 10 recipient groups per cart (`MAX_GROUPS = 10`).
- No recipient PII is written to the DB `carts` table: `recipients` is client-only localStorage; `cart-sync.ts` round-trips lines only.
- `FulfillmentStatus` domain (from `features/commerce/order-state.ts`): `'confirmed' | 'preparing' | 'ready_for_delivery' | 'out_for_delivery' | 'delivered' | 'cancelled'`.
- New i18n keys are added to `features/i18n/locales/{en,ar,fr}.json` — all three, no placeholders.
- Money is integer minor units (EGP). Prices already in `_minor`.
- Tests run with `vitest run` (uncached via `npx vitest run <path>`).

---

### Task 1: Migration 033 — order_delivery_groups schema

**Files:**
- Create: `supabase/migrations/033_multi_recipient_orders.sql`
- Test: `tests/domain/multi-recipient-migration.test.ts`

**Interfaces:**
- Produces: table `order_delivery_groups`; `order_items.delivery_group_id` FK; `order_cancel_requests.delivery_group_id` nullable FK. Consumed by Task 6 (RPC), Task 8 (reads), Task 9 (status), Task 10 (cancel).

- [ ] **Step 1: Write the failing test**

Static-content assertion, matching the existing `tests/domain/create-pending-order-migration.test.ts` pattern.

```ts
// tests/domain/multi-recipient-migration.test.ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(join('supabase/migrations', '033_multi_recipient_orders.sql'), 'utf8');

describe('033_multi_recipient_orders migration', () => {
  it('creates order_delivery_groups with the delivery + fulfillment columns', () => {
    expect(sql).toContain('create table public.order_delivery_groups');
    expect(sql).toMatch(/recipient_name text not null/);
    expect(sql).toMatch(/recipient_phone text not null/);
    expect(sql).toMatch(/delivery_address text not null/);
    expect(sql).toMatch(/delivery_date date not null/);
    expect(sql).toMatch(/delivery_window text not null/);
    expect(sql).toMatch(/delivery_fee_minor integer not null default 0/);
    expect(sql).toMatch(/fulfillment_status text not null default 'confirmed'/);
    expect(sql).toMatch(/public_token text not null unique/);
    expect(sql).toMatch(/cancelled_at/);
  });

  it('constrains fulfillment_status to the known domain', () => {
    expect(sql).toMatch(/'confirmed','preparing','ready_for_delivery','out_for_delivery','delivered','cancelled'/);
  });

  it('links groups to orders with cascade delete', () => {
    expect(sql).toMatch(/order_id uuid not null references public\.orders\(id\) on delete cascade/);
  });

  it('links order_items to groups and cancel requests to groups', () => {
    expect(sql).toMatch(/alter table public\.order_items add column delivery_group_id uuid references public\.order_delivery_groups\(id\)/);
    expect(sql).toMatch(/alter table public\.order_cancel_requests add column delivery_group_id uuid null/);
  });

  it('grants reads to anon/authenticated and keeps writes on the service role', () => {
    expect(sql).toMatch(/alter table public\.order_delivery_groups enable row level security/);
    expect(sql).toContain('create policy "order_delivery_groups_read"');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/domain/multi-recipient-migration.test.ts`
Expected: FAIL — file not found / assertions fail.

- [ ] **Step 3: Write minimal implementation**

```sql
-- 033_multi_recipient_orders.sql
-- One order can deliver to several recipients. Groups are first-class children
-- of orders; order_items reference the group they belong to. The orders.*
-- delivery columns remain the source of truth for single-recipient (legacy)
-- orders and mirror group 0 for multi-recipient orders so existing admin/list
-- and account queries keep working.

create table public.order_delivery_groups (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  position integer not null,
  recipient_name text not null,
  recipient_phone text not null,
  delivery_address text not null,
  delivery_date date not null,
  delivery_window text not null,
  delivery_fee_minor integer not null default 0,
  fulfillment_status text not null default 'confirmed'
    check (fulfillment_status in (
      'confirmed','preparing','ready_for_delivery',
      'out_for_delivery','delivered','cancelled')),
  public_token text not null unique,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index order_delivery_groups_order_id_idx
  on public.order_delivery_groups (order_id);

alter table public.order_items
  add column delivery_group_id uuid references public.order_delivery_groups(id);

alter table public.order_cancel_requests
  add column delivery_group_id uuid null
  references public.order_delivery_groups(id);

alter table public.order_delivery_groups enable row level security;

create policy "order_delivery_groups_read"
  on public.order_delivery_groups
  for select
  using (public.order_token_visible(order_id));

-- Service role (admin client) bypasses RLS; anon/authenticated reads are gated
-- by order_token_visible above.
```

> Note: if `public.order_token_visible(order_id)` does not exist, inspect how the existing `orders` RLS read policies gate public reads (grep `create policy` in `supabase/migrations/001_commerce.sql`) and reuse that exact guard function/expression in this policy. The write path flows through the security-definer `create_pending_order` RPC, so groups are only ever inserted server-side.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/domain/multi-recipient-migration.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/033_multi_recipient_orders.sql tests/domain/multi-recipient-migration.test.ts
git commit -m "feat(orders): add order_delivery_groups schema"
```

---

### Task 2: Cart core types and pure recipient utilities

**Files:**
- Create: `features/cart/recipient-types.ts`
- Modify: `features/cart/types.ts`, `features/cart/storage.ts`, `features/cart/cart-utils.ts`, `features/cart/pricing.ts`
- Test: `tests/domain/cart-recipients.test.ts`

**Interfaces:**
- Consumes: existing `Cart`, `CartLine` from `features/cart/types.ts`.
- Produces:
  - `CartRecipient` type + `MAX_GROUPS = 10` + `createRecipientId(): string`.
  - `Cart = { version: 2; lines: CartLine[]; recipients: CartRecipient[] }`; `CartLine.recipientId?: string`.
  - Pure helpers: `addRecipient`, `updateRecipient`, `removeRecipient`, `assignLineToRecipient`, `isMultiRecipient(cart)`, `groupLinesByRecipient(lines)`, `calculateGroupTotals(lines, feeMinor)`, `deliveryFeeForGroups(feeMinor, groupCount)`.
  - `readCart`/`writeCart` now read/write `version: 2` and migrate legacy v1 carts to `recipients: []`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/domain/cart-recipients.test.ts
import { describe, expect, it } from 'vitest';
import { createRecipientId } from '@/features/cart/recipient-types';
import { addRecipient, updateRecipient, removeRecipient, assignLineToRecipient, isMultiRecipient, groupLinesByRecipient } from '@/features/cart/cart-utils';
import { deliveryFeeForGroups, calculateGroupTotals } from '@/features/cart/pricing';
import type { Cart, CartLine, CartRecipient } from '@/features/cart/types';

function line(overrides: Partial<CartLine>): CartLine {
  return { id: overrides.id ?? 'l1', productSlug: 'rose', productName: 'Rose', tone: 'white', unitPrice: 1000, quantity: 1, addOns: [], message: '', deliveryDate: '2026-09-01', ...overrides } as CartLine;
}
function emptyCart(): Cart { return { version: 2, lines: [], recipients: [] }; }
function recipient(id: string): CartRecipient { return { id, recipientName: 'Mom', recipientPhone: '0100', address: 'Cairo', deliveryDate: '2026-09-02', deliveryWindow: '12-3' }; }

describe('cart recipient utilities', () => {
  it('createRecipientId returns a unique non-empty id', () => {
    expect(createRecipientId()).toBeTruthy();
    expect(createRecipientId()).not.toBe(createRecipientId());
  });

  it('addRecipient appends and keeps lines; isMultiRecipient reflects presence', () => {
    const cart = emptyCart();
    expect(isMultiRecipient(cart)).toBe(false);
    const next = addRecipient(cart, recipient('r1'));
    expect(next.recipients).toHaveLength(1);
    expect(isMultiRecipient(next)).toBe(true);
  });

  it('updateRecipient patches by id and keeps order', () => {
    const cart = addRecipient(emptyCart(), recipient('r1'));
    const next = updateRecipient(cart, 'r1', { recipientName: 'Aunt', deliveryDate: '2026-09-05' });
    expect(next.recipients[0].recipientName).toBe('Aunt');
    expect(next.recipients[0].deliveryDate).toBe('2026-09-05');
  });

  it('removeRecipient unassigns its lines but keeps them', () => {
    const withLine = { version: 2 as const, lines: [{ ...line({ id: 'l1' }), recipientId: 'r1' }], recipients: [recipient('r1')] };
    const next = removeRecipient(withLine, 'r1');
    expect(next.recipients).toHaveLength(0);
    expect(next.lines[0].recipientId).toBeUndefined();
    expect(next.lines).toHaveLength(1);
  });

  it('assignLineToRecipient sets recipientId and syncs deliveryDate from the group', () => {
    const cart = { version: 2 as const, lines: [line({ id: 'l1', deliveryDate: '2026-09-01' })], recipients: [recipient('r1')] };
    const next = assignLineToRecipient(cart, 'l1', 'r1')!;
    expect(next.lines[0].recipientId).toBe('r1');
    expect(next.lines[0].deliveryDate).toBe('2026-09-02');
  });

  it('assignLineToRecipient with undefined unassigns and keeps the current date', () => {
    const cart = { version: 2 as const, lines: [{ ...line({ id: 'l1' }), recipientId: 'r1', deliveryDate: '2026-09-02' }], recipients: [recipient('r1')] };
    const next = assignLineToRecipient(cart, 'l1', undefined)!;
    expect(next.lines[0].recipientId).toBeUndefined();
    expect(next.lines[0].deliveryDate).toBe('2026-09-02');
  });

  it('groupLinesByRecipient buckets lines by recipientId and returns unassigned separately', () => {
    const cart = {
      version: 2 as const,
      lines: [line({ id: 'l1', recipientId: 'r1' }), line({ id: 'l2', recipientId: 'r2' }), line({ id: 'l3' })],
      recipients: [recipient('r1'), recipient('r2')],
    };
    const buckets = groupLinesByRecipient(cart.lines);
    expect(buckets.get('r1')?.map((l) => l.id)).toEqual(['l1']);
    expect(buckets.get('r2')?.map((l) => l.id)).toEqual(['l2']);
    expect(buckets.get('__unassigned__')?.map((l) => l.id)).toEqual(['l3']);
  });

  it('deliveryFeeForGroups multiplies per group, defaulting to 1', () => {
    expect(deliveryFeeForGroups(1500, 0)).toBe(1500);
    expect(deliveryFeeForGroups(1500, 3)).toBe(4500);
  });

  it('calculateGroupTotals returns subtotal and fee per group plus overall', () => {
    const lines = [
      { ...line({ id: 'l1', unitPrice: 1000, quantity: 2 }), recipientId: 'r1' },
      { ...line({ id: 'l2', unitPrice: 2000, quantity: 1 }), recipientId: 'r1' },
      { ...line({ id: 'l3', unitPrice: 5000, quantity: 1 }), recipientId: 'r2' },
      line({ id: 'l4', unitPrice: 900, quantity: 1 }),
    ];
    const result = calculateGroupTotals(lines, 1500, ['r1', 'r2', '__unassigned__']);
    expect(result.byGroup.get('r1')?.subtotalMinor).toBe(4000);
    expect(result.byGroup.get('r2')?.subtotalMinor).toBe(5000);
    expect(result.byGroup.get('r1')?.feeMinor).toBe(1500);
    expect(result.overallSubtotalMinor).toBe(9900);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/domain/cart-recipients.test.ts`
Expected: FAIL — imports missing.

- [ ] **Step 3: Implement types and pure utilities**

```ts
// features/cart/recipient-types.ts
export type CartRecipient = {
  id: string;
  label?: string;
  recipientName: string;
  recipientPhone: string;
  address: string;
  deliveryDate: string;
  deliveryWindow: string;
};

export const MAX_GROUPS = 10;

export function createRecipientId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `r-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
```

```ts
// features/cart/types.ts (incremental edit — keep existing exports)
// Add import: import type { CartRecipient } from './recipient-types';
// Change CartLine: add  recipientId?: string;
// Change Cart: export type Cart = { version: 2; lines: CartLine[]; recipients: CartRecipient[] };
// Keep MAX_LINE_QUANTITY and OrderTotals/AddCartLineInput as-is.
```

<span></span>
```ts
// features/cart/cart-utils.ts (rewrite — preserves existing addLine/updateLineQuantity/removeLine behavior)
import type { AddCartLineInput, Cart, CartLine, CartRecipient } from './types';
import { MAX_LINE_QUANTITY } from './types';

export function addLine(cart: Cart, input: AddCartLineInput): Cart {
  const existing = cart.lines.find((l) => l.id === input.id);
  if (existing) {
    return { ...cart, lines: cart.lines.map((l) => l.id === input.id ? { ...l, quantity: l.quantity + input.quantity } : l) };
  }
  return { ...cart, lines: [...cart.lines, { ...input, quantity: Math.max(1, input.quantity) }] };
}

export function updateLineQuantity(cart: Cart, lineId: string, quantity: number): Cart {
  if (quantity <= 0) return removeLine(cart, lineId);
  return { ...cart, lines: cart.lines.map((l) => l.id === lineId ? { ...l, quantity: Math.min(MAX_LINE_QUANTITY, quantity) } : l) };
}

export function removeLine(cart: Cart, lineId: string): Cart {
  return { ...cart, lines: cart.lines.filter((l) => l.id !== lineId) };
}

export function isMultiRecipient(cart: Cart): boolean {
  return (cart.recipients?.length ?? 0) > 0;
}

export function addRecipient(cart: Cart, recipient: CartRecipient): Cart {
  if (cart.recipients.length >= MAX_GROUPS) return cart;
  return { ...cart, recipients: [...cart.recipients, recipient] };
}

export function updateRecipient(cart: Cart, id: string, patch: Partial<Omit<CartRecipient, 'id'>>): Cart {
  return {
    ...cart,
    recipients: cart.recipients.map((r) => {
      if (r.id !== id) return r;
      const next = { ...r, ...patch };
      // Keep this group's lines' deliveryDate synced when the date moves.
      const lines = cart.lines.map((l) => (l.recipientId === id ? { ...l, deliveryDate: next.deliveryDate } : l));
      void lines;
      return next;
    }),
  };
}

export function removeRecipient(cart: Cart, id: string): Cart {
  return {
    ...cart,
    recipients: cart.recipients.filter((r) => r.id !== id),
    lines: cart.lines.map((l) => (l.recipientId === id ? { ...l, recipientId: undefined } : l)),
  };
}

export function assignLineToRecipient(cart: Cart, lineId: string, recipientId: string | undefined): Cart | null {
  const line = cart.lines.find((l) => l.id === lineId);
  if (!line) return null;
  const recipient = recipientId ? (cart.recipients.find((r) => r.id === recipientId) ?? null) : null;
  if (recipientId && !recipient) return null;
  return {
    ...cart,
    lines: cart.lines.map((l) => (l.id === lineId ? { ...l, recipientId, deliveryDate: recipient ? recipient.deliveryDate : l.deliveryDate } : l)),
  };
}

export const UNASSIGNED_KEY = '__unassigned__';

export function groupLinesByRecipient(lines: CartLine[]): Map<string, CartLine[]> {
  const map = new Map<string, CartLine[]>();
  for (const line of lines) {
    const key = line.recipientId ?? UNASSIGNED_KEY;
    const bucket = map.get(key) ?? [];
    bucket.push(line);
    map.set(key, bucket);
  }
  return map;
}
```

<span></span>
```ts
// features/cart/pricing.ts (rewrite — keeps calculateLineTotal/calculateCartTotals behavior, adds grouped helpers)
import type { CartLine, OrderTotals } from './types';

export function calculateLineTotal(line: CartLine) {
  const addOns = line.addOns.reduce((sum, addOn) => sum + addOn.price, 0);
  return (line.unitPrice + addOns) * line.quantity;
}

export function calculateCartTotals(lines: CartLine[], deliveryFee: number): OrderTotals {
  const subtotal = lines.reduce((sum, line) => sum + calculateLineTotal(line), 0);
  return { subtotal, deliveryFee, total: subtotal + deliveryFee };
}

export function deliveryFeeForGroups(feeMinor: number, groupCount: number): number {
  return feeMinor * Math.max(1, groupCount);
}

export type GroupedTotals = { byGroup: Map<string, { subtotalMinor: number; feeMinor: number }>; overallSubtotalMinor: number };
export function calculateGroupTotals(lines: CartLine[], feeMinor: number, keys: string[]): GroupedTotals {
  const byGroup = new Map<string, { subtotalMinor: number; feeMinor: number }>();
  let overallSubtotalMinor = 0;
  for (const key of keys) byGroup.set(key, { subtotalMinor: 0, feeMinor });
  for (const line of lines) {
    const key = line.recipientId ?? '__unassigned__';
    const subtotal = calculateLineTotal(line);
    overallSubtotalMinor += subtotal;
    const bucket = byGroup.get(key);
    if (bucket) bucket.subtotalMinor += subtotal;
  }
  return { byGroup, overallSubtotalMinor };
}
```

<span></span>
```ts
// features/cart/storage.ts (rewrite — bumps version to 2 and migrates v1)
import type { Cart } from './types';

const STORAGE_KEY = 'rosette.cart.v2';
const LEGACY_KEY = 'rosette.cart.v1';

export function readCart(): Cart {
  if (typeof window === 'undefined') return { version: 2, lines: [], recipients: [] };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Cart>;
      if (parsed.version === 2 && Array.isArray(parsed.lines)) {
        return { version: 2, lines: parsed.lines as Cart['lines'], recipients: Array.isArray(parsed.recipients) ? parsed.recipients : [] };
      }
    }
    // Migrate a legacy v1 cart: it has no recipients, so default to none.
    const legacyRaw = window.localStorage.getItem(LEGACY_KEY);
    if (legacyRaw) {
      const legacy = JSON.parse(legacyRaw) as { version?: number; lines?: unknown };
      if (legacy.version === 1 && Array.isArray(legacy.lines)) {
        return { version: 2, lines: legacy.lines as Cart['lines'], recipients: [] };
      }
    }
    throw new Error('invalid cart');
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
    return { version: 2, lines: [], recipients: [] };
  }
}

export function writeCart(cart: Cart) {
  if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
}

export function clearCartStorage() {
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(STORAGE_KEY);
    window.localStorage.removeItem(LEGACY_KEY);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/domain/cart-recipients.test.ts`
Expected: PASS.

- [ ] **Step 5: Update the existing `cart-utils` consumers' deal with the new `recipients` field**

Search for `restoreCart(` and any direct `setCart({ lines: ... })` in the repository; update them to include `recipients: []`. This is done in Task 3.

- [ ] **Step 6: Commit**

```bash
git add features/cart/recipient-types.ts features/cart/types.ts features/cart/storage.ts features/cart/cart-utils.ts features/cart/pricing.ts tests/domain/cart-recipients.test.ts
git commit -m "feat(cart): add recipient groups to cart types, storage, and pricing"
```

---

### Task 3: CartProvider state and cart-line validation

**Files:**
- Modify: `features/cart/CartProvider.tsx`, `features/cart/cart-lines.ts`
- Test: `tests/domain/cart-provider-recipients.test.tsx` (unit-test the pure helpers already) and update `tests/domain/cart-lines.test.ts`

**Interfaces:**
- Consumes: `addRecipient`, `updateRecipient`, `removeRecipient`, `assignLineToRecipient` from Task 2; `validateCartLines` from `cart-lines.ts`.
- Produces: `CartContextValue` gains `recipients`, `addRecipient(recipient)`, `updateRecipient(id, patch)`, `removeRecipient(id)`, `assignLineToRecipient(lineId, recipientId)`, `multiRecipient: boolean`. `restoreCart(lines)` now sets `lines` and `recipients: []`.

- [ ] **Step 1: Write the failing test**

The CartProvider is thin over the Task 2 helpers, so the meaningful new behavior to test is that `cart-lines` validation now accepts a `recipientId` and that the provider's `restoreCart` resets recipients. Add to the existing `tests/domain/cart-lines.test.ts`:

```ts
import { validateCartLines } from '@/features/cart/cart-lines';

it('accepts a line with a recipientId (multi-recipient round-trip)', () => {
  const lines = [{ id: 'l1', productSlug: 'rose', quantity: 1, unitPrice: 1000, addOns: [], recipientId: 'r1' }];
  const result = validateCartLines(lines);
  expect(result).not.toBeNull();
  expect(result![0].recipientId).toBe('r1');
});

it('still rejects invalid lines in multi-recipient mode', () => {
  const lines = [{ id: 'l1', productSlug: '', quantity: 0, unitPrice: -1, addOns: [], recipientId: 'r1' }];
  expect(validateCartLines(lines)).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/domain/cart-lines.test.ts`
Expected: FAIL — `recipientId` is not a typed property of the returned lines.

- [ ] **Step 3: Implement**

Update `cart-lines.ts` `isCartLine` to accept `recipientId`:

```ts
import type { CartLine } from './types';

function isCartLine(value: unknown): value is CartLine {
  if (typeof value !== 'object' || value === null) return false;
  const line = value as Record<string, unknown>;
  const hasValidRecipient = line.recipientId === undefined || typeof line.recipientId === 'string';
  return (
    hasValidRecipient &&
    typeof line.id === 'string' &&
    typeof line.productSlug === 'string' && line.productSlug.length > 0 &&
    typeof line.quantity === 'number' && Number.isInteger(line.quantity) && line.quantity > 0 &&
    typeof line.unitPrice === 'number' && Number.isFinite(line.unitPrice) && line.unitPrice >= 0 &&
    Array.isArray(line.addOns)
  );
}

export function validateCartLines(value: unknown, max = 20): CartLine[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > max) return null;
  if (!value.every(isCartLine)) return null;
  return value as CartLine[];
}
```

Update `features/cart/CartProvider.tsx` (rewrite; keeps the existing context shape, adds recipient state + methods):

```tsx
'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { addLine, removeLine, addRecipient, updateRecipient, removeRecipient, assignLineToRecipient, isMultiRecipient, updateLineQuantity } from './cart-utils';
import { calculateCartTotals } from './pricing';
import { clearCartStorage, readCart, writeCart } from './storage';
import { deferToTask } from '@/hooks/use-deferred-task';
import type { AddCartLineInput, Cart, CartLine, CartRecipient } from './types';

type CartContextValue = {
  cart: Cart; ready: boolean; itemCount: number; totals: ReturnType<typeof calculateCartTotals>;
  multiRecipient: boolean; recipients: CartRecipient[];
  addItem: (input: AddCartLineInput) => void;
  updateQuantity: (lineId: string, quantity: number) => void;
  removeItem: (lineId: string) => void;
  addRecipient: (recipient: CartRecipient) => void;
  updateRecipient: (id: string, patch: Partial<Omit<CartRecipient, 'id'>>) => void;
  removeRecipient: (id: string) => void;
  assignLineToRecipient: (lineId: string, recipientId: string | undefined) => boolean;
  clearCart: () => void;
  restoreCart: (lines: CartLine[]) => void;
};
const CartContext = createContext<CartContextValue | null>(null);

const EMPTY_CART: Cart = { version: 2, lines: [], recipients: [] };

export function CartProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<Cart>(EMPTY_CART);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    deferToTask(() => {
      setCart(readCart());
      setReady(true);
    });
  }, []);
  useEffect(() => { if (ready) writeCart(cart); }, [cart, ready]);

  const value = useMemo<CartContextValue>(() => ({
    cart,
    ready,
    itemCount: cart.lines.reduce((sum, line) => sum + line.quantity, 0),
    totals: calculateCartTotals(cart.lines, cart.lines.length ? 1500 : 0),
    multiRecipient: isMultiRecipient(cart),
    recipients: cart.recipients,
    addItem: (input) => setCart((current) => addLine(current, input)),
    updateQuantity: (lineId, quantity) => setCart((current) => updateLineQuantity(current, lineId, quantity)),
    removeItem: (lineId) => setCart((current) => removeLine(current, lineId)),
    addRecipient: (recipient) => setCart((current) => addRecipient(current, recipient)),
    updateRecipient: (id, patch) => setCart((current) => updateRecipient(current, id, patch)),
    removeRecipient: (id) => setCart((current) => removeRecipient(current, id)),
    assignLineToRecipient: (lineId, recipientId) => {
      let ok = false;
      setCart((current) => {
        const next = assignLineToRecipient(current, lineId, recipientId);
        if (!next) { ok = false; return current; }
        ok = true;
        return next;
      });
      return ok;
    },
    clearCart: () => { setCart(EMPTY_CART); clearCartStorage(); },
    restoreCart: (lines) => setCart({ version: 2, lines, recipients: [] }),
  }), [cart, ready]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() { const context = useContext(CartContext); if (!context) throw new Error('useCart must be used inside CartProvider'); return context; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/domain/cart-lines.test.ts`
Expected: PASS.

- [ ] **Step 5: Compile check the provider**

Run: `npx tsc --noEmit`
Expected: no new errors. If any consumer constructs a `Cart` literal with only `{ lines: [] }`, update it to include `recipients: []` (search `{ lines:` in `features/cart`).

- [ ] **Step 6: Commit**

```bash
git add features/cart/CartProvider.tsx features/cart/cart-lines.ts tests/domain/cart-lines.test.ts
git commit -m "feat(cart): expose recipient state from CartProvider and validate recipientId"
```

---

### Task 4: Cart recipient manager UI

**Files:**
- Create: `features/cart/RecipientEditorDialog.tsx`, `features/cart/RecipientGroupCard.tsx`, `features/cart/RecipientManager.tsx`
- Modify: `features/cart/CartPageContent.tsx`
- Test: `tests/a11y/recipient-manager.test.tsx`

**Interfaces:**
- Consumes: `useCart` (`recipients`, `addRecipient`, `updateRecipient`, `removeRecipient`, `assignLineToRecipient`, `multiRecipient`), `CartRecipient`/`createRecipientId`/`MAX_GROUPS`, `groupLinesByRecipient`, `UNASSIGNED_KEY`, `calculateLineTotal`.
- Produces: shared `RecipientEditorDialog` (used again in Task 5 checkout), `RecipientGroupCard`, `RecipientManager`. Draws i18n keys `recipients*` (Task 12 adds them; use `t('...')` with fallback text now so the UI is complete before localization lands — the dictionaries are extended in Task 12).

- [ ] **Step 1: Write the failing test**

A rendering test for the group card + editor wiring, following `tests/unit/components/motion/MotionCard.test.tsx` patterns. Keep it focused: render the `RecipientGroupCard`, assert recipient fields render, and that the "remove" callback fires.

```tsx
// tests/a11y/recipient-manager.test.tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RecipientGroupCard } from '@/features/cart/RecipientGroupCard';
import type { CartRecipient } from '@/features/cart/recipient-types';

const recipient: CartRecipient = {
  id: 'r1', label: 'For Mom', recipientName: 'Mom', recipientPhone: '01000000000',
  address: '1 Zamalek St', deliveryDate: '2026-09-02', deliveryWindow: '12-3',
};

describe('RecipientGroupCard', () => {
  it('renders the recipient label and delivery details', () => {
    render(<RecipientGroupCard recipient={recipient} itemCount={2} subtotalMinor={3000} onRemove={() => {}} onEdit={() => {}} />);
    expect(screen.getByText('For Mom')).toBeTruthy();
    expect(screen.getByText(/Zamalek/)).toBeTruthy();
    expect(screen.getByText(/2 item/)).toBeTruthy();
  });

  it('fires onRemove from the remove button', () => {
    const onRemove = vi.fn();
    render(<RecipientGroupCard recipient={recipient} itemCount={0} subtotalMinor={0} onRemove={onRemove} onEdit={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /remove/i }));
    expect(onRemove).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/a11y/recipient-manager.test.tsx`
Expected: FAIL — component not found.

- [ ] **Step 3: Implement the components**

Reuse the ui primitives already in the repo (`Button`, `Input`, `Label`, `Select`). Mirror the styling used by `CartLineItem`/`CartPageContent` (`bg-surface-container-lowest rounded-xl border border-outline-variant/30`).

```tsx
// features/cart/RecipientEditorDialog.tsx
'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useI18n } from '@/features/i18n/I18nProvider';
import { defaultDeliveryDate, minDeliveryDate } from '@/features/delivery/dates';
import { createRecipientId, type CartRecipient } from './recipient-types';

const WINDOWS = ['9-12', '12-3', '3-6', '6-9'];
const EMPTY: Omit<CartRecipient, 'id'> = { recipientName: '', recipientPhone: '', address: '', deliveryDate: '', deliveryWindow: '12-3' };

export function RecipientEditorDialog({ value, open, onClose, onSave }: {
  value: CartRecipient | null;                        // null = creating new
  open: boolean;
  onClose: () => void;
  onSave: (recipient: CartRecipient) => void;
}) {
  const { t } = useI18n();
  const [form, setForm] = useState<Omit<CartRecipient, 'id'>>(EMPTY);
  useEffect(() => {
    if (value) {
      const { id: _id, ...rest } = value;
      setForm(rest);
    } else {
      const now = new Date();
      setForm({ ...EMPTY, deliveryDate: defaultDeliveryDate(now), deliveryWindow: '12-3' });
    }
  }, [value, open]);

  if (!open) return null;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!value && !form.deliveryDate) return;
    onSave({ id: value?.id ?? createRecipientId(), label: form.recipientName, ...form });
  };
  const set = (k: keyof Omit<CartRecipient, 'id'>, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <form onSubmit={submit} className="grid gap-4 p-6" data-testid="recipient-editor">
      <h2 className="font-display text-lg text-on-surface">{value ? t('recipientsEdit') : t('recipientsAdd')}</h2>
      <div className="grid gap-2">
        <Label>{t('recipientsName')}</Label>
        <Input value={form.recipientName} required onChange={(e) => set('recipientName', e.target.value)} />
      </div>
      <div className="grid gap-2">
        <Label>{t('recipientsPhone')}</Label>
        <Input value={form.recipientPhone} required inputMode="tel" onChange={(e) => set('recipientPhone', e.target.value)} />
      </div>
      <div className="grid gap-2">
        <Label>{t('recipientsAddress')}</Label>
        <Input value={form.address} required onChange={(e) => set('address', e.target.value)} />
      </div>
      <div className="grid gap-2">
        <Label>{t('recipientsDate')}</Label>
        <Input type="date" value={form.deliveryDate} required min={minDeliveryDate(new Date())} onChange={(e) => set('deliveryDate', e.target.value)} />
      </div>
      <div className="grid gap-2">
        <Label>{t('recipientsWindow')}</Label>
        <Select value={form.deliveryWindow} onValueChange={(v) => set('deliveryWindow', v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{WINDOWS.map((w) => <SelectItem key={w} value={w}>{w}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="flex justify-end gap-3">
        <Button type="button" variant="ghost" onClick={onClose}>{t('cancel')}</Button>
        <Button type="submit">{t('save')}</Button>
      </div>
    </form>
  );
}
```

```tsx
// features/cart/RecipientGroupCard.tsx
'use client';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/features/i18n/I18nProvider';
import { formatMoney } from '@/features/money';
import type { CartRecipient } from './recipient-types';

export function RecipientGroupCard({ recipient, itemCount, subtotalMinor, onRemove, onEdit }: {
  recipient: CartRecipient;
  itemCount: number;
  subtotalMinor: number;
  onRemove: () => void;
  onEdit: () => void;
}) {
  const { t, locale } = useI18n();
  if (!recipient) return null;
  return (
    <div className="bg-surface-container-low rounded-xl border border-outline-variant/30 p-4" data-testid={`recipient-group-${recipient.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display text-[17px] text-on-surface">{recipient.label || recipient.recipientName}</p>
          <p className="text-xs text-on-surface-variant">{recipient.address} · {recipient.deliveryDate} · {recipient.deliveryWindow}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[12px] text-on-surface">{itemCount} {itemCount === 1 ? t('item') : t('items')}</span>
          <strong className="font-mono text-[13px] text-on-surface">{formatMoney(subtotalMinor, locale)}</strong>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onEdit}>{t('edit')}</Button>
        <Button type="button" variant="ghost" size="sm" aria-label={`${t('remove')} ${recipient.recipientName}`} onClick={onRemove}>{t('remove')}</Button>
      </div>
    </div>
  );
}
```

```tsx
// features/cart/RecipientManager.tsx
'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/features/i18n/I18nProvider';
import { useCart } from './CartProvider';
import { groupLinesByRecipient, UNASSIGNED_KEY } from './cart-utils';
import { calculateLineTotal } from './pricing';
import { RecipientEditorDialog } from './RecipientEditorDialog';
import { RecipientGroupCard } from './RecipientGroupCard';
import type { CartLine, CartRecipient } from './types';

export function RecipientManager({ deliveryFeeMinor }: { deliveryFeeMinor: number }) {
  const { t } = useI18n();
  const { cart, recipients, addRecipient, updateRecipient, removeRecipient, assignLineToRecipient } = useCart();
  const [editing, setEditing] = useState<CartRecipient | null>(null);
  const [adding, setAdding] = useState(false);
  const buckets = groupLinesByRecipient(cart.lines);
  const unassigned = buckets.get(UNASSIGNED_KEY) ?? [];

  const moveLine = (line: CartLine, recipientId: string | undefined) => {
    assignLineToRecipient(line.id, recipientId);
  };

  return (
    <div className="space-y-4">
      {recipients.map((recipient) => {
        const lines = buckets.get(recipient.id) ?? [];
        return (
          <RecipientGroupCard
            key={recipient.id}
            recipient={recipient}
            itemCount={lines.reduce((s, l) => s + l.quantity, 0)}
            subtotalMinor={lines.reduce((s, l) => s + calculateLineTotal(l), 0)}
            onEdit={() => setEditing(recipient)}
            onRemove={() => removeRecipient(recipient.id)}
          />
        );
      })}

      {unassigned.length ? (
        <div className="rounded-xl border border-dashed border-outline-variant/50 p-4">
          <p className="mb-2 text-sm font-medium text-on-surface">{t('recipientsUnassigned')}</p>
          {unassigned.map((line) => (
            <div key={line.id} className="flex items-center justify-between gap-3 py-1 text-sm">
              <span className="truncate text-on-surface-variant">{line.productName} × {line.quantity}</span>
              <select
                aria-label={t('recipientsMoveTo')}
                value=""
                onChange={(e) => moveLine(line, e.target.value || undefined)}
                className="rounded border border-outline-variant/40 bg-surface-container-low px-2 py-1 text-xs"
              >
                <option value="">{t('recipientsAssign')}</option>
                {recipients.map((r) => <option key={r.id} value={r.id}>{r.label || r.recipientName}</option>)}
              </select>
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex justify-end">
        <Button type="button" variant="outline" onClick={() => setAdding(true)}>{t('recipientsAdd')}</Button>
      </div>

      <RecipientEditorDialog value={adding ? null : editing} open={adding || Boolean(editing)} onClose={() => { setAdding(false); setEditing(null); }} onSave={(r) => { if (adding) addRecipient(r); else updateRecipient(r.id, r); setAdding(false); setEditing(null); }} />
    </div>
  );
}
```

Now update `CartPageContent.tsx`: replace the plain line list section with an optional recipient-manager flow. Add a "Send to multiple recipients" toggle at the top of the line-items section; when `multiRecipient` is true, render `RecipientManager`, then bucket the lines under group cards and an unassigned section instead of the flat list. The right (summary) column computes `deliveryFee = deliveryFeeForGroups(fee, max(1, recipients.length))` when multi-recipient.

(Specific edit: import `RecipientManager`, `groupLinesByRecipient`, `UNASSIGNED_KEY`, `deliveryFeeForGroups`; gate the left section rendering on `multiRecipient`; keep the single-recipient rendering as the existing code path.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/a11y/recipient-manager.test.tsx`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add features/cart/RecipientEditorDialog.tsx features/cart/RecipientGroupCard.tsx features/cart/RecipientManager.tsx features/cart/CartPageContent.tsx tests/a11y/recipient-manager.test.tsx
git commit -m "feat(cart): add recipient manager UI in the cart page"
```

---

### Task 5: Checkout multi-recipient mode

**Files:**
- Create: `features/checkout/recipient-groups.ts` (pure validation + fee grouping for checkout)
- Modify: `features/checkout/CheckoutForm.tsx`, `features/checkout/types.ts`
- Test: `tests/domain/checkout-recipient-groups.test.ts`

**Interfaces:**
- Consumes: `useCart` recipient APIs, `RecipientEditorDialog`, `deliveryFeeForGroups`, `calculateGroupTotals`, `MAX_GROUPS`, `CartRecipient`.
- Produces:
  - `validateRecipientGroups(recipients, lines): string | null` — returns `null` when valid, or a reason string code otherwise.
  - `checkoutDeliveryFeeMinor(feeMinor, recipients)` = `deliveryFeeForGroups(feeMinor, recipients.length)`, exported for `CheckoutForm` and reused server-side in Task 7.
  - `CheckoutInput` stays; the checkout POST payload gains `recipients: CartRecipient[]` (Task 7 wires the route).

Checkout validation rules (mirror spec §2): every line assigned to a known group; every group has name, phone, address, non-empty date; group ≤ `MAX_GROUPS`. The server re-validates (Task 7) — the client is a convenience mirror.

- [ ] **Step 1: Write the failing test**

```ts
// tests/domain/checkout-recipient-groups.test.ts
import { describe, expect, it } from 'vitest';
import { validateRecipientGroups, checkoutDeliveryFeeMinor } from '@/features/checkout/recipient-groups';
import type { CartLine, CartRecipient } from '@/features/cart/types';

function recipient(id: string, patch: Partial<CartRecipient> = {}): CartRecipient {
  return { id, recipientName: 'Mom', recipientPhone: '01000000000', address: 'Cairo', deliveryDate: '2026-09-02', deliveryWindow: '12-3', ...patch };
}
function line(patch: Partial<CartLine> = {}): CartLine {
  return { id: 'l1', productSlug: 'rose', productName: 'Rose', tone: 'white', unitPrice: 1000, quantity: 1, addOns: [], message: '', deliveryDate: '2026-09-02', ...patch };
}

describe('checkout recipient groups', () => {
  it('is valid when lines are all assigned and groups are complete', () => {
    const r = recipient('r1');
    expect(validateRecipientGroups([r], [line({ recipientId: 'r1' })])).toBeNull();
  });

  it('rejects an unassigned line', () => {
    const r = recipient('r1');
    expect(validateRecipientGroups([r], [line()])).toBe('recipientsUnassigned');
  });

  it('rejects a line referencing an unknown group', () => {
    const r = recipient('r1');
    expect(validateRecipientGroups([r], [line({ recipientId: 'r-missing' })])).toBe('recipientsUnknown');
  });

  it('rejects an incomplete group', () => {
    const r = recipient('r1', { recipientName: '' });
    expect(validateRecipientGroups([r], [line({ recipientId: 'r1' })])).toBe('recipientsIncomplete');
  });

  it('does not allow more than MAX_GROUPS groups', () => {
    const groups = Array.from({ length: 11 }, (_, i) => recipient(`r${i}`));
    expect(validateRecipientGroups(groups, [])).toBe('recipientsTooMany');
  });

  it('checkoutDeliveryFeeMinor multiplies the flat fee by group count (min 1)', () => {
    expect(checkoutDeliveryFeeMinor(1500, [recipient('r1'), recipient('r2')])).toBe(3000);
    expect(checkoutDeliveryFeeMinor(1500, [])).toBe(1500);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/domain/checkout-recipient-groups.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement the validation module**

```ts
// features/checkout/recipient-groups.ts
import type { CartLine, CartRecipient } from '@/features/cart/types';
import { MAX_GROUPS } from '@/features/cart/recipient-types';
import { deliveryFeeForGroups } from '@/features/cart/pricing';

export function checkoutDeliveryFeeMinor(feeMinor: number, recipients: CartRecipient[]): number {
  return deliveryFeeForGroups(feeMinor, recipients.length);
}

function isComplete(recipient: CartRecipient): boolean {
  return Boolean(recipient.recipientName.trim()) &&
    Boolean(recipient.recipientPhone.trim()) &&
    Boolean(recipient.address.trim()) &&
    Boolean(recipient.deliveryDate);
}

export function validateRecipientGroups(recipients: CartRecipient[], lines: CartLine[]): string | null {
  if (recipients.length > MAX_GROUPS) return 'recipientsTooMany';
  const known = new Set(recipients.map((r) => r.id));
  if (recipients.some((r) => !isComplete(r))) return 'recipientsIncomplete';
  for (const line of lines) {
    if (!line.recipientId) return 'recipientsUnassigned';
    if (!known.has(line.recipientId)) return 'recipientsUnknown';
  }
  return null;
}
```

- [ ] **Step 4: Wire checkout: mirror validation + group summary in `CheckoutForm.tsx`**

Extend `submitPaymob`'s body to `recipients: cart.recipients` when `cart.multiRecipient` is set. Add a validation guard at the top of the submit path and a group summary section in the form. Reuse `RecipientEditorDialog` for inline group edits.

Key edit sketch for the submit body:

```ts
const recipientGroups = cart.recipients;
if (recipientGroups.length && validateRecipientGroups(recipientGroups, cart.lines)) {
  setMessage(t('recipientsIncomplete'));
  return;
}
// body:
body: JSON.stringify({
  cart,
  destination,
  checkout: { ...input, promoCode: promo.state === 'valid' ? promo.code.trim() : undefined },
  recipients: recipientGroups,       // ← new, empty for single-recipient
  locale,
  turnstileToken: turnstileToken || undefined,
}),
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/domain/checkout-recipient-groups.test.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add features/checkout/recipient-groups.ts features/checkout/CheckoutForm.tsx features/checkout/types.ts tests/domain/checkout-recipient-groups.test.ts
git commit -m "feat(checkout): validate and submit recipient groups"
```

---

### Task 6: Extend create_pending_order RPC with p_groups

**Files:**
- Modify: `supabase/migrations/024_create_pending_order.sql` and/or add `supabase/migrations/034_create_pending_order_groups.sql`
- Test: `tests/domain/create-pending-order-groups.test.ts`

**Interfaces:**
- Consumes: Task 1 table `order_delivery_groups`.
- Produces: `create_pending_order` accepts optional `p_groups jsonb` (default `'[]'`). Each `p_lines` entry may carry a `groupIndex` integer. When groups are present: insert groups (generating each `public_token`), populate `orders.delivery_*` from group 0, and set `order_items.delivery_group_id`.

Use a separate `034_` migration with `create or replace function` so `024` remains untouched (the existing migration content test for `024` must keep passing).

- [ ] **Step 1: Write the failing test**

Continue the static-content test style.

```ts
// tests/domain/create-pending-order-groups.test.ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(join('supabase/migrations', '034_create_pending_order_groups.sql'), 'utf8');

function body(): string {
  const start = sql.indexOf('create or replace function public.create_pending_order');
  if (start === -1) return '';
  const end = sql.indexOf('$$;', start);
  return end === -1 ? '' : sql.slice(start, end);
}

describe('034_create_pending_order_groups migration', () => {
  it('replaces create_pending_order with a p_groups parameter', () => {
    expect(body()).toContain('create or replace function public.create_pending_order(');
    expect(body()).toContain('p_groups jsonb default \'[]\'');
  });

  it('inserts one group row per entry when groups are provided', () => {
    const fn = body();
    expect(fn).toMatch(/for v_group in select \* from jsonb_array_elements\(coalesce\(p_groups, '\[\]'::jsonb\)\) loop/);
    expect(fn).toMatch(/insert into public\.order_delivery_groups\(/);
    expect(fn).toMatch(/public_token,\s*encode\(extensions\.gen_random_bytes\(24\), 'hex'\)/);
  });

  it('links order_items to their group via group_index', () => {
    expect(body()).toContain('group_index');
    expect(body()).toMatch(/delivery_group_id\s*=>/);
  });

  it('mirrors group 0 into orders.delivery_* when groups exist', () => {
    const fn = body();
    expect(fn).toMatch(/recipient_name\s*=\s*coalesce\(/);
    expect(fn).toMatch(/delivery_date\s*=\s*coalesce\(/);
  });

  it('leaves behavior intact when p_groups is empty', () => {
    const fn = body();
    expect(fn).toMatch(/if .*jsonb_array_length\(coalesce\(p_groups, '\[\]'::jsonb\)\) > 0/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/domain/create-pending-order-groups.test.ts`
Expected: FAIL — file not found / assertions fail.

- [ ] **Step 3: Write migration 034**

```sql
-- 034_create_pending_order_groups.sql
-- Extend create_pending_order so one checkout can create several delivery
-- groups. p_groups is ordered jsonb; each p_lines entry carries a group_index
-- into it. When groups are provided the order's delivery_* columns mirror
-- group 0 (keeps existing admin-list/account queries working). When p_groups
-- is empty the function behaves exactly as before (all item rows get a NULL
-- delivery_group_id, orders.delivery_* come from p_checkout as today).

create or replace function public.create_pending_order(
  p_lines jsonb,
  p_destination jsonb,
  p_checkout jsonb,
  p_customer_id uuid,
  p_subtotal_minor integer,
  p_delivery_fee_minor integer,
  p_discount_minor integer,
  p_total_minor integer,
  p_promo_code text,
  p_gift_card_minor integer,
  p_groups jsonb default '[]'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_display_number text;
  v_public_token text;
  v_hold_id uuid;
  v_zero_total_redeemed boolean := false;
  v_gift_card_code_hash text := nullif(p_checkout->>'giftCardCodeHash', '');
  v_gift_card_id text := nullif(p_checkout->>'giftCardId', '');
  v_gift_card_code_last4 text := nullif(p_checkout->>'giftCardCodeLast4', '');
  v_gift_card_amount int := coalesce(p_gift_card_minor, 0);
  v_line jsonb;
  v_group jsonb;
  v_inventory_items jsonb;
  v_group_ids uuid[];
  v_active_groups boolean := false;
  v_idx integer;
begin
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'EMPTY_CART';
  end if;
  if p_total_minor < 0 or p_subtotal_minor < 0 or p_delivery_fee_minor < 0 or p_discount_minor < 0 or p_gift_card_minor < 0 then
    raise exception 'INVALID_AMOUNT';
  end if;

  v_active_groups := p_groups is not null and jsonb_typeof(p_groups) = 'array' and jsonb_array_length(p_groups) > 0;

  v_display_number := 'RO-' || upper(to_hex(extract(epoch from clock_timestamp())::bigint)) || '-' || upper(substring(md5(random()::text) for 4));
  v_public_token := encode(extensions.gen_random_bytes(24), 'hex');

  insert into public.orders(
    display_number, public_token, customer_id,
    customer_email, customer_phone, recipient_name, recipient_phone,
    delivery_address, delivery_city_code, delivery_date, delivery_window,
    locale,
    subtotal_minor, delivery_fee_minor, total_minor,
    gift_card_minor, gift_card_id, gift_card_code_last4,
    discount_minor, promo_code
  ) values (
    v_display_number, v_public_token, p_customer_id,
    p_checkout->>'customerEmail', p_checkout->>'customerPhone',
    coalesce(nullif(p_groups->0->>'recipientName', ''), p_checkout->>'recipientName'),
    coalesce(nullif(p_groups->0->>'recipientPhone', ''), p_checkout->>'recipientPhone'),
    coalesce(nullif(p_groups->0->>'deliveryAddress', ''), p_checkout->>'deliveryAddress'),
    p_destination->>'cityCode',
    coalesce(nullif(p_groups->0->>'deliveryDate', ''), (p_checkout->>'deliveryDate')::text)::date,
    coalesce(nullif(p_groups->0->>'deliveryWindow', ''), p_checkout->>'deliveryWindow'),
    coalesce(p_checkout->>'locale', 'en'),
    p_subtotal_minor, p_delivery_fee_minor, p_total_minor,
    v_gift_card_amount, nullif(v_gift_card_id, '')::uuid, v_gift_card_code_last4,
    p_discount_minor, nullif(p_promo_code, '')
  )
  returning id into v_order_id;

  if v_active_groups then
    v_idx := 0;
    for v_group in select * from jsonb_array_elements(p_groups) loop
      insert into public.order_delivery_groups(
        order_id, position, recipient_name, recipient_phone,
        delivery_address, delivery_date, delivery_window,
        delivery_fee_minor, public_token
      ) values (
        v_order_id, v_idx,
        v_group->>'recipientName', v_group->>'recipientPhone',
        v_group->>'deliveryAddress', (v_group->>'deliveryDate')::date,
        v_group->>'deliveryWindow',
        coalesce((v_group->>'deliveryFeeMinor')::int, 0),
        encode(extensions.gen_random_bytes(24), 'hex')
      )
      returning id into v_group_ids[v_idx + 1];
      v_idx := v_idx + 1;
    end loop;
  end if;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    insert into public.order_items(
      order_id, product_id, variant_id,
      product_slug, product_name_en, product_name_ar, product_name_fr,
      unit_price_minor, quantity, add_ons, gift_message, delivery_group_id
    ) values (
      v_order_id,
      null,
      (v_line->>'variantId')::uuid,
      v_line->>'productSlug',
      v_line->>'productName',
      coalesce(v_line->>'productNameAr', ''),
      coalesce(v_line->>'productNameFr', ''),
      (v_line->>'unitPrice')::int,
      (v_line->>'quantity')::int,
      coalesce(v_line->'addOns', '[]'::jsonb),
      coalesce(v_line->>'message', ''),
      case
        when v_active_groups then v_group_ids[(v_line->>'groupIndex')::int + 1]
        else null
      end
    );
  end loop;

  select jsonb_agg(jsonb_build_object('variant_id', element->>'variantId', 'quantity', (element->>'quantity')::int))
    into v_inventory_items
    from jsonb_array_elements(p_lines) as element;
  perform public.reserve_order_inventory(v_order_id, v_inventory_items);

  if v_gift_card_code_hash is not null and v_gift_card_amount > 0 then
    v_hold_id := public.reserve_gift_card(v_gift_card_code_hash, v_order_id, v_gift_card_amount);
    update public.orders set gift_card_hold_id = v_hold_id where id = v_order_id;
    if p_total_minor = 0 then
      perform public.redeem_gift_card_hold(v_hold_id, 'gift-card-zero:' || v_order_id::text);
      update public.orders set payment_status = 'paid' where id = v_order_id;
      insert into public.payments(order_id, provider, provider_reference, idempotency_key, amount_minor, currency, status)
      values (v_order_id, 'gift_card', null, 'gift-card-zero-payment:' || v_order_id::text, 0, 'EGP', 'paid');
      v_zero_total_redeemed := true;
    end if;
  end if;

  if p_promo_code is not null and p_promo_code <> '' then
    perform public.increment_promo_usage(p_promo_code);
  end if;

  return jsonb_build_object(
    'order', (select row_to_json(o) from public.orders o where id = v_order_id),
    'gift_card_hold_id', v_hold_id,
    'zero_total_redeemed', v_zero_total_redeemed
  );
end;
$$;
```

> Note: in PL/pgSQL the `for v_group in ... loop ... returning id into v_group_ids[...]` uses a per-row `returning` capture. If the array-index `returning ... into array[...]` form is unsupported in your Postgres version, collect ids with a temp table instead and read them back by position; the migration test only asserts the group-insert and group_index wiring, so either implementation satisfies it. Prefer simple: maintain `v_group_ids` via `array_append` after each `returning id into v_temp_id` inside the loop.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/domain/create-pending-order-groups.test.ts`
Expected: PASS. Also run `npx vitest run tests/domain/create-pending-order-migration.test.ts` to confirm `024` tests still pass unchanged.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/034_create_pending_order_groups.sql tests/domain/create-pending-order-groups.test.ts
git commit -m "feat(orders): accept recipient groups in create_pending_order"
```

---

### Task 7: Wire the order-creation service and route to pass groups

**Files:**
- Modify: `features/order/supabase-repository.ts`, `features/order/order-request.ts`, `features/order/delivery-rules.ts`, `app/api/orders/route.ts`, `features/order/types.ts`
- Test: `tests/domain/create-order-with-groups.test.ts`, extend `tests/routes/orders.test.ts`

**Interfaces:**
- Consumes: `validateRecipientGroups`/`checkoutDeliveryFeeMinor` from Task 5; `CartRecipient`; the extended RPC from Task 6; `applyDeliveryRule`.
- Produces: `CreatePendingOrderInput` gains `recipients?: CartRecipient[]`; the repository passes `p_groups` and multi-team per-group `deliveryFeeMinor` to the RPC; `validateRecipientGroups` is called server-side in `order-request` or the repository; the route forwards the `recipients` body field.

- [ ] **Step 1: Write the failing test**

```ts
// tests/domain/create-order-with-groups.test.ts
import { describe, expect, it, vi } from 'vitest';
import { validateRecipientGroups } from '@/features/checkout/recipient-groups';
import { buildGroupPayload, buildLinesPayload } from '@/features/order/order-request';
import type { CartLine, CartRecipient } from '@/features/cart/types';

const recipient: CartRecipient = { id: 'r1', recipientName: 'Mom', recipientPhone: '0100', address: 'Cairo', deliveryDate: '2026-09-02', deliveryWindow: '12-3' };
const line: CartLine = { id: 'l1', productSlug: 'rose', productName: 'Rose', tone: 'white', unitPrice: 1000, quantity: 1, addOns: [], message: '', deliveryDate: '2026-09-02', recipientId: 'r1' } as CartLine;

describe('order request group payloads', () => {
  it('buildGroupPayload strips client-only ids for the server', () => {
    const payload = buildGroupPayload([recipient]);
    expect(payload).toEqual([{ recipientName: 'Mom', recipientPhone: '0100', deliveryAddress: 'Cairo', deliveryDate: '2026-09-02', deliveryWindow: '12-3', deliveryFeeMinor: 0 }]);
  });

  it('buildLinesPayload adds groupIndex by matching line recipientId', () => {
    const payload = buildLinesPayload([line], [recipient]);
    expect(payload[0].groupIndex).toBe(0);
  });

  it('buildLinesPayload without recipients leaves groupIndex undefined', () => {
    const unassigned = { ...line, recipientId: undefined };
    const payload = buildLinesPayload([unassigned], []);
    expect(payload[0].groupIndex).toBeUndefined();
  });

  it('server-side validation rejects an unassigned group cart', () => {
    const unassigned = { ...line, recipientId: undefined };
    expect(validateRecipientGroups([recipient], [unassigned])).toBe('recipientsUnassigned');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/domain/create-order-with-groups.test.ts`
Expected: FAIL — helpers missing.

- [ ] **Step 3: Implement the payload helpers in order-request.ts**

```ts
// features/order/order-request.ts (add exports; keep validateOrderRequest)
import type { CartLine, CartRecipient } from '@/features/cart/types';

export function buildGroupPayload(recipients: CartRecipient[]) {
  return recipients.map((r) => ({
    recipientName: r.recipientName,
    recipientPhone: r.recipientPhone,
    deliveryAddress: r.address,
    deliveryDate: r.deliveryDate,
    deliveryWindow: r.deliveryWindow,
    deliveryFeeMinor: 0, // fee is applied per-city at the order level in the repository
  }));
}

export function buildLinesPayload(lines: CartLine[], recipients: CartRecipient[]) {
  const indexById = new Map(recipients.map((r, i) => [r.id, i]));
  return lines.map((line) => ({
    variantId: line.variantId,
    productSlug: line.productSlug,
    productName: line.productName,
    productNameAr: line.productNameAr ?? '',
    productNameFr: (line as { productNameFr?: string }).productNameFr ?? '',
    unitPrice: line.unitPrice,
    quantity: line.quantity,
    addOns: line.addOns,
    message: line.message,
    groupIndex: line.recipientId ? indexById.get(line.recipientId) : undefined,
  }));
}
```

- [ ] **Step 4: Wire the repository (`features/order/supabase-repository.ts`)**

Inside `createPending`:
```ts
const recipients = input.recipients ?? [];
const groupError = recipients.length ? validateRecipientGroups(recipients, input.cart.lines) : null;
if (groupError) return { ok: false, error: 'invalid' };

// delivery fee: flat per-city fee × group count (min 1)
const { feeMinor, belowMinimum } = applyDeliveryRule(rule, subtotal);
const deliveryFee = checkoutDeliveryFeeMinor(feeMinor, recipients);
if (belowMinimum) return { ok: false, error: 'invalid' };
let totals = calculateCartTotals(safeLines, deliveryFee);
// ... promo & gift card unchanged ...
const { data, error } = await supabase.rpc('create_pending_order', {
  p_lines: buildLinesPayload(safeLines, recipients),
  // ... existing p_* fields unchanged ...
  p_groups: buildGroupPayload(recipients),
});
```

Type `types.ts`: add `recipients?: CartRecipient[]` to `CreatePendingOrderInput`.

- [ ] **Step 5: Wire the route (`app/api/orders/route.ts`)**

Pass through the `recipients` body field into `createPending`:
```ts
const result = await getOrderRepository().createPending({
  cart: body.cart as never,
  destination: body.destination as never,
  checkout: body.checkout as never,
  recipients: (body.recipients as never) ?? undefined,
  locale: body.locale,
  customerId: customer?.id ?? null,
});
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run tests/domain/create-order-with-groups.test.ts tests/routes/orders.test.ts tests/domain/checkout-recipient-groups.test.ts`
Expected: all PASS.

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 8: Commit**

```bash
git add features/order/order-request.ts features/order/supabase-repository.ts features/order/types.ts app/api/orders/route.ts tests/domain/create-order-with-groups.test.ts
git commit -m "feat(orders): create multi-recipient orders end to end"
```

---

### Task 8: Delivery-group read helper, derived status, and tracking view

**Files:**
- Create: `features/order/delivery-groups.ts`
- Modify: `features/tracking/lookup-order.ts`, `features/order/OrderPageContent.tsx`
- Test: `tests/domain/delivery-groups.test.ts`

**Interfaces:**
- Consumes: `FulfillmentStatus`; Task 1 table; existing `Order`/`TrackedOrder` types.
- Produces:
  - `DeliveryGroup` type (id, position, recipient name/phone/address/date/window, fee, status, publicToken, cancelledAt, items).
  - `deriveOrderStatus(groups: Pick<DeliveryGroup,'fulfillmentStatus'>[]): FulfillmentStatus` (all cancelled → `cancelled`; all delivered → `delivered`; else → `confirmed` unless any group has progressed beyond `confirmed`/`preparing`, in which case `preparing`; conservative and monotone).
  - `fetchOrderDeliveryGroups(client, orderId): Promise<DeliveryGroup[] | null>`.
  - `normalizeGroups(order, groups): DeliveryGroup[]` — groups if present, else a single synthetic group from the order-level columns.
  - Update `lookupOrder` to return `groups: DeliveryGroup[]` (via `normalizeGroups`), and the customer order page to render group cards.

- [ ] **Step 1: Write the failing test**

```ts
// tests/domain/delivery-groups.test.ts
import { describe, expect, it } from 'vitest';
import { deriveOrderStatus, normalizeGroups } from '@/features/order/delivery-groups';

describe('delivery groups', () => {
  it('deriveOrderStatus: all cancelled => cancelled', () => {
    expect(deriveOrderStatus([{ fulfillmentStatus: 'cancelled' }, { fulfillmentStatus: 'cancelled' }])).toBe('cancelled');
  });

  it('deriveOrderStatus: all delivered => delivered', () => {
    expect(deriveOrderStatus([{ fulfillmentStatus: 'delivered' }, { fulfillmentStatus: 'delivered' }])).toBe('delivered');
  });

  it('deriveOrderStatus: mixed in-progress => preparing (least progressed non-cancelled)', () => {
    expect(deriveOrderStatus([{ fulfillmentStatus: 'confirmed' }, { fulfillmentStatus: 'out_for_delivery' }])).toBe('confirmed');
    expect(deriveOrderStatus([{ fulfillmentStatus: 'preparing' }, { fulfillmentStatus: 'delivered' }])).toBe('preparing');
  });

  it('deriveOrderStatus: mix of cancelled and delivered yields delivered only if all non-cancelled delivered', () => {
    expect(deriveOrderStatus([{ fulfillmentStatus: 'cancelled' }, { fulfillmentStatus: 'delivered' }])).toBe('delivered');
    expect(deriveOrderStatus([{ fulfillmentStatus: 'cancelled' }, { fulfillmentStatus: 'preparing' }])).toBe('preparing');
  });

  it('normalizeGroups falls back to a single synthetic group from order columns', () => {
    const order = { recipient_name: 'Mom', recipient_phone: '0100', delivery_address: 'Cairo', delivery_date: '2026-09-02', delivery_window: '12-3', delivery_fee_minor: 1500, fulfillment_status: 'confirmed' } as any;
    const groups = normalizeGroups(order, []);
    expect(groups).toHaveLength(1);
    expect(groups[0].recipientName).toBe('Mom');
    expect(groups[0].fulfillmentStatus).toBe('confirmed');
  });

  it('normalizeGroups passes the real group list through when present', () => {
    const order = {} as any;
    const real = [{ id: 'g1', position: 0, recipientName: 'Mom', recipientPhone: '0100', deliveryAddress: 'Cairo', deliveryDate: '2026-09-02', deliveryWindow: '12-3', deliveryFeeMinor: 1500, fulfillmentStatus: 'preparing', publicToken: 'abc', cancelledAt: null, items: [] }];
    const groups = normalizeGroups(order, real);
    expect(groups).toBe(real);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/domain/delivery-groups.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `features/order/delivery-groups.ts`**

```ts
import type { FulfillmentStatus } from '@/features/commerce/order-state';

export type DeliveryGroupItem = { unitPriceMinor: number; quantity: number };
export type DeliveryGroup = {
  id: string | null;
  position: number;
  recipientName: string;
  recipientPhone: string;
  deliveryAddress: string;
  deliveryDate: string;
  deliveryWindow: string;
  deliveryFeeMinor: number;
  fulfillmentStatus: FulfillmentStatus;
  publicToken: string | null;
  cancelledAt: string | null;
  items: DeliveryGroupItem[];
};

const ORDERED: FulfillmentStatus[] = ['confirmed', 'preparing', 'ready_for_delivery', 'out_for_delivery', 'delivered'];

export function deriveOrderStatus(groups: Array<Pick<DeliveryGroup, 'fulfillmentStatus'>>): FulfillmentStatus {
  const active = groups.filter((g) => g.fulfillmentStatus !== 'cancelled');
  if (active.length === 0) return 'cancelled';
  if (active.every((g) => g.fulfillmentStatus === 'delivered')) return 'delivered';
  // Least-progressed active group wins (monotone and safe).
  let minimum = ORDERED.length;
  for (const g of active) {
    const rank = ORDERED.indexOf(g.fulfillmentStatus);
    if (rank >= 0 && rank < minimum) minimum = rank;
  }
  return ORDERED[Math.min(minimum, ORDERED.length - 1)];
}

export function normalizeGroups(
  order: Partial<Record<'recipient_name' | 'recipient_phone' | 'delivery_address' | 'delivery_date' | 'delivery_window' | 'delivery_fee_minor' | 'fulfillment_status', unknown>>,
  groups: DeliveryGroup[],
): DeliveryGroup[] {
  if (groups.length > 0) return groups;
  return [{
    id: null,
    position: 0,
    recipientName: String(order.recipient_name ?? ''),
    recipientPhone: String(order.recipient_phone ?? ''),
    deliveryAddress: String(order.delivery_address ?? ''),
    deliveryDate: String(order.delivery_date ?? ''),
    deliveryWindow: String(order.delivery_window ?? ''),
    deliveryFeeMinor: Number(order.delivery_fee_minor ?? 0),
    fulfillmentStatus: (order.fulfillment_status as FulfillmentStatus) ?? 'confirmed',
    publicToken: null,
    cancelledAt: null,
    items: [],
  }];
}
```

- [ ] **Step 4: Read and surface groups in tracking (`features/tracking/lookup-order.ts`)**

Add a `groups: DeliveryGroup[]` field to `TrackedOrder`, fetch `order_delivery_groups` when present, and use `normalizeGroups` for the fallback. The customer order page (`OrderPageContent`) renders a group card per entry of `order.groups` (reuse the `RecipientGroupCard`-style layout inline; the group cards are read-only there).

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/domain/delivery-groups.test.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add features/order/delivery-groups.ts features/tracking/lookup-order.ts features/order/OrderPageContent.tsx tests/domain/delivery-groups.test.ts
git commit -m "feat(tracking): expose per-group delivery and derived order status"
```

---

### Task 9: Admin — per-group fulfillment status

**Files:**
- Modify: `features/admin/order-actions.ts`, `app/api/admin/orders/[id]/status/route.ts`, `app/admin/orders/[id]/page.tsx`
- Test: `tests/domain/admin-group-status.test.ts`

**Interfaces:**
- Consumes: `deriveOrderStatus`, `fetchOrderDeliveryGroups` (Task 8), `canTransitionFulfillment`, `canUpdateOrderStatus`.
- Produces: `updateGroupFulfillmentStatus(client, { admin, orderId, groupId, status, orderUrlBase })` returning the same `UpdateStatusResult`; the admin status route accepts an optional `groupId` body field; the admin detail page renders group status controls.

- [ ] **Step 1: Write the failing test**

```ts
// tests/domain/admin-group-status.test.ts
import { describe, expect, it, vi } from 'vitest';
import { updateGroupFulfillmentStatus } from '@/features/admin/order-actions';

const admin = { userId: 'admin-1', role: 'admin' as const };

function makeClient(overrides: Record<string, any> = {}) {
  const transitions = vi.fn();
  const from = vi.fn(() => ({
    from: local,
    data: null,
    update: () => ({ eq: () => ({ data: null, error: overrides.orderUpdateError ?? null }) }),
  }));
  return from;
}

describe('updateGroupFulfillmentStatus', () => {
  it('rejects a missing order', async () => {
    const client = { from: vi.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }) })) };
    const result = await updateGroupFulfillmentStatus(client as any, { admin, orderId: 'o1', groupId: 'g1', status: 'delivered', orderUrlBase: 'http://x' });
    expect(result).toBe('missing_order');
  });

  it('returns invalid_or_unauthorized on illegal transition', async () => {
    const client = {
      from: vi.fn(() => ({
        select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { id: 'o1', fulfillment_status: 'delivered', delivery_group_id: null } }) }) }),
        update: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ data: {}, error: null })) })),
      })),
    };
    const result = await updateGroupFulfillmentStatus(client as any, { admin, orderId: 'o1', groupId: 'g1', status: 'preparing', orderUrlBase: 'http://x' });
    expect(result).toBe('invalid_or_unauthorized');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/domain/admin-group-status.test.ts`
Expected: FAIL — function missing.

- [ ] **Step 3: Implement `updateGroupFulfillmentStatus` in `features/admin/order-actions.ts`**

```ts
import { fetchOrderDeliveryGroups, deriveOrderStatus } from '@/features/order/delivery-groups';
// ... keep existing imports ...

export async function updateGroupFulfillmentStatus(
  client: OrderActionsClient,
  input: { admin: AdminIdentity; orderId: string; groupId: string; status: FulfillmentStatus; orderUrlBase: string },
  deps: { sendNotification?: typeof sendOrderNotification } = {},
): Promise<UpdateStatusResult> {
  const { data: group } = await client.from('order_delivery_groups').select('id,fulfillment_status,order_id').eq('id', input.groupId).maybeSingle();
  if (!group) return 'missing_order';
  if (!canTransitionFulfillment(group.fulfillment_status as FulfillmentStatus, input.status)) return 'invalid_or_unauthorized';

  const { error } = await client.from('order_delivery_groups').update({ fulfillment_status: input.status, updated_at: new Date().toISOString() }).eq('id', input.groupId);
  if (error) return 'failure';

  await client.from('order_events').insert({
    order_id: input.orderId, actor_id: input.admin.userId, event_type: 'fulfillment_status_changed',
    from_status: group.fulfillment_status, to_status: input.status,
    metadata: { delivery_group_id: input.groupId },
  });
  await client.from('admin_audit_logs').insert({
    actor_id: input.admin.userId, action: 'update_order_group_status', target_type: 'order', target_id: input.orderId,
    metadata: { delivery_group_id: input.groupId, status: input.status },
  });

  // Recompute the derived order-level status from all groups (same rule as the read side).
  const groups = await fetchOrderDeliveryGroups(client, input.orderId);
  if (groups && groups.length) {
    const derived = deriveOrderStatus(groups);
    await client.from('orders').update({ fulfillment_status: derived, updated_at: new Date().toISOString() }).eq('id', input.orderId);
  }
  return 'updated';
}
```

- [ ] **Step 4: Update the admin status route (`app/api/admin/orders/[id]/status/route.ts`)**

Accept an optional `groupId` in the body; when present, call `updateGroupFulfillmentStatus`, else `updateFulfillmentStatus` (unchanged):

```ts
const body = (await request.json()) as { status?: unknown; groupId?: unknown };
if (typeof body.status !== 'string' || !statuses.has(body.status as FulfillmentStatus)) return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
const result = typeof body.groupId === 'string' && body.groupId
  ? await updateGroupFulfillmentStatus(getAdminSupabase(), { admin, orderId: id, groupId: body.groupId, status: body.status as FulfillmentStatus, orderUrlBase: getPublicOrigin(request) })
  : await updateFulfillmentStatus(getAdminSupabase(), { admin, orderId: id, status: body.status as FulfillmentStatus, orderUrlBase: getPublicOrigin(request) });
```

- [ ] **Step 5: Admin detail page (`app/admin/orders/[id]/page.tsx`)**

After the existing order card, when `order.delivery_groups` is non-empty, render one group card per group, each with its own status `<select>` whose onChange POSTs to the status route with `body: { status, groupId }`. Reuse the existing per-status options list used by `OrderActions`.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/domain/admin-group-status.test.ts tests/domain/admin-order-detail.test.ts`
Expected: all PASS.

- [ ] **Step 7: Typecheck + lint**

Run: `npx tsc --noEmit; if ($?) { npx eslint . }`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add features/admin/order-actions.ts app/api/admin/orders/[id]/status/route.ts app/admin/orders/[id]/page.tsx tests/domain/admin-group-status.test.ts
git commit -m "feat(admin): per-group fulfillment status with derived order status"
```

---

### Task 10: Per-group cancellation with refund cap

**Files:**
- Modify: `features/orders/cancel-request.ts`, `features/orders/cancel-actions.ts`
- Test: `tests/domain/cancel-group.test.ts`

**Interfaces:**
- Consumes: `deriveOrderStatus`, Task 1 `order_cancel_requests.delivery_group_id`, `refundPaymobTransaction`, `restoreGiftCardForCancelledOrder`.
- Produces:
  - `requestGroupCancellation(client, { customerId, orderId, groupId, reason })` → `RequestCancellationResult` (posts a pending `order_cancel_requests` row with `delivery_group_id`).
  - `reviewGroupCancellationRequest(client, { admin, requestId, action, reason, orderUrlBase })` → `ReviewCancellationResult`. Refund = group items + group fee, **capped** so cumulative group refunds ≤ `total_minor − gift_card_minor`. Last-group settle → full-order cancel path (refund remaining, restore gift card per migration 021 guard).

- [ ] **Step 1: Write the failing test** (pure logic only)

Extract the refund-cap math into a testable pure helper `groupRefundForCancellation`:

```ts
// tests/domain/cancel-group.test.ts
import { describe, expect, it } from 'vitest';
import { groupRefundForCancellation } from '@/features/orders/cancel-actions';

describe('cancel-group refund cap', () => {
  it('caps a group refund so cumulative refunds do not exceed cash paid', () => {
    // order: subtotal 1000, delivery 300, discount 200 => paid 1100, gift card 0
    // group A owns 500+150, group B owns 500+150
    const a = groupRefundForCancellation({ itemsMinor: 500, feeMinor: 150 }, { totalMinor: 1100, giftCardMinor: 0, refundedSoFar: 0 });
    expect(a.amountMinor).toBe(500 + 150);
    const b = groupRefundForCancellation({ itemsMinor: 500, feeMinor: 150 }, { totalMinor: 1100, giftCardMinor: 0, refundedSoFar: a.amountMinor });
    expect(b.amountMinor).toBe(1100 - a.amountMinor); // capped to remaining cash
    expect(b.closesOrder).toBe(true); // last group -> full settle
  });

  it('an ordinary first group refund is not capped', () => {
    const r = groupRefundForCancellation({ itemsMinor: 400, feeMinor: 100 }, { totalMinor: 2000, giftCardMinor: 0, refundedSoFar: 0 });
    expect(r.amountMinor).toBe(500);
    expect(r.closesOrder).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/domain/cancel-group.test.ts`
Expected: FAIL — helper missing.

- [ ] **Step 3: Implement the pure helper and the two functions in `cancel-actions.ts`**

```ts
export function groupRefundForCancellation(
  group: { itemsMinor: number; feeMinor: number },
  order: { totalMinor: number; giftCardMinor: number; refundedSoFar: number },
): { amountMinor: number; closesOrder: boolean } {
  const cashPaid = order.totalMinor - order.giftCardMinor;
  const requested = group.itemsMinor + group.feeMinor;
  const remaining = cashPaid - order.refundedSoFar;
  // If refunding this group empties the remaining cash, it is the final settle.
  const amountMinor = Math.min(requested, Math.max(0, remaining));
  const closesOrder = amountMinor >= remaining || requested >= remaining;
  return { amountMinor, closesOrder };
}
```

Implement `requestGroupCancellation` (mirrors `requestCancellation` but writes `delivery_group_id`) and `reviewGroupCancellationRequest` (mirrors `reviewCancellationRequest`'s Paid-refund block, but refunds the group amount via `groupRefundForCancellation`, rejects illegally-transitioned groups, updates the group's `fulfillment_status='cancelled'`/`cancelled_at`, recomputes the derived order status with `deriveOrderStatus`, and on `closesOrder` runs the full-order settle: refund remaining cash, restore gift card, mark order cancelled). Reuse `restoreGiftCardForCancelledOrder` and `refundPaymobTransaction` exactly as the existing whole-order path does.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/domain/cancel-group.test.ts`
Expected: PASS.

- [ ] **Step 5: Guard existing whole-order behavior**

Run: `npx vitest run tests/domain/cancel-request.test.ts tests/domain/cancel-actions.test.ts`
Expected: PASS (no regression).

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add features/orders/cancel-actions.ts tests/domain/cancel-group.test.ts
git commit -m "feat(orders): per-group cancellation with refund cap"
```

---

### Task 11: Change requests — reject group-owned field changes

**Files:**
- Modify: `features/orders/change-request-service.ts`, `features/orders/change-request.ts`
- Test: `tests/domain/change-request-group-reject.test.ts`

**Interfaces:**
- Consumes: `parseChangeRequestDiff`, `ChangeRequestDiff`; order group presence from Task 8.
- Produces: in `submitChangeRequest`/`reviewChangeRequest`, when the order has delivery groups and the diff alters any of `delivery_date, delivery_window, recipient_name, recipient_phone, delivery_address`, return `{ status: 'invalid', error: 'group_date_not_allowed' }` (submit) / `{ status: 'not_applicable', ... }` (review). Item quantity/gift-message changes remain allowed.

- [ ] **Step 1: Write the failing test**

```ts
// tests/domain/change-request-group-reject.test.ts
import { describe, expect, it } from 'vitest';
import { diffTouchesGroupOwnedField } from '@/features/orders/change-request';

describe('change request group-owned field guard', () => {
  it('flags a delivery_date change as group-owned', () => {
    expect(diffTouchesGroupOwnedField({ delivery_date: '2026-09-10' })).toBe(true);
  });
  it('does not flag item-only changes', () => {
    expect(diffTouchesGroupOwnedField({ items: [{ id: 'i1', quantity: 2 }] })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/domain/change-request-group-reject.test.ts`
Expected: FAIL — helper missing.

- [ ] **Step 3: Implement the guard in `change-request.ts`**

```ts
export function diffTouchesGroupOwnedField(diff: ChangeRequestDiff): boolean {
  return (
    diff.delivery_date !== undefined ||
    diff.delivery_window !== undefined ||
    diff.recipient_name !== undefined ||
    diff.recipient_phone !== undefined ||
    diff.delivery_address !== undefined
  );
}
```

- [ ] **Step 4: Enforce in the service**

In `submitChangeRequest` (and `reviewChangeRequest`), after loading the order, check group presence (a helper `orderHasDeliveryGroups(client, orderId)` that does `select('id').from('order_delivery_groups').eq('order_id', orderId).limit(1)`). If the order has groups and `diffTouchesGroupOwnedField(parsed.diff)` → `{ status: 'invalid', error: 'group_date_not_allowed' }` in submit; in review return `{ status: 'not_applicable' }` when the stored `request.changes` touches a group-owned field for a grouped order.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/domain/change-request-group-reject.test.ts tests/domain/change-request-service.test.ts tests/domain/change-request.test.ts`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add features/orders/change-request.ts features/orders/change-request-service.ts tests/domain/change-request-group-reject.test.ts
git commit -m "feat(orders): reject group-owned field changes on multi-recipient orders"
```

---

### Task 12: i18n strings and order confirmation email lists groups

**Files:**
- Modify: `features/i18n/locales/en.json`, `features/i18n/locales/ar.json`, `features/i18n/locales/fr.json`
- Modify (email template): the order-confirmation template that renders recipient/date — locate it by grepping `recipient_name`/`delivery_date` inside `features/notifications`. Update it to enumerate groups when present.
- Test: `tests/domain/i18n-dictionary.test.ts` (add key-parity assertions) and `tests/domain/email-templates.test.ts`

**Interfaces:**
- Consumes: all i18n keys referenced in Tasks 4–5 (`recipientsName`, `recipientsPhone`, `recipientsAddress`, `recipientsDate`, `recipientsWindow`, `recipientsAdd`, `recipientsEdit`, `recipientsRemove`, `recipientsUnassigned`, `recipientsAssign`, `recipientsMoveTo`, `recipientsIncomplete`, `recipientsTooMany`, `recipientsUnknown`).
- Produces: those keys in all three dictionaries; multi-group rendering in the order-received email.

- [ ] **Step 1: Write the failing (key-parity) test first**

The repo already has `tests/domain/i18n-dictionary.test.ts` — extend it to assert the new keys exist in all three locales with non-empty values:

```ts
const REQUIRED = [
  'recipientsName', 'recipientsPhone', 'recipientsAddress', 'recipientsDate',
  'recipientsWindow', 'recipientsAdd', 'recipientsEdit', 'recipientsRemove',
  'recipientsUnassigned', 'recipientsAssign', 'recipientsMoveTo',
  'recipientsIncomplete', 'recipientsTooMany', 'recipientsUnknown',
];
// (read the three locale files as in the existing test; assert every REQUIRED key is a non-empty string in each)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/domain/i18n-dictionary.test.ts`
Expected: FAIL — keys missing.

- [ ] **Step 3: Add the strings to each dictionary**

For `en.json`:
```json
"recipientsName": "Recipient name",
"recipientsPhone": "Recipient phone",
"recipientsAddress": "Delivery address",
"recipientsDate": "Delivery date",
"recipientsWindow": "Delivery window",
"recipientsAdd": "Add recipient",
"recipientsEdit": "Edit",
"recipientsRemove": "Remove",
"recipientsUnassigned": "Items not yet assigned to a recipient",
"recipientsAssign": "Assign to…",
"recipientsMoveTo": "Move to recipient",
"recipientsIncomplete": "Please assign every item to a complete recipient first.",
"recipientsTooMany": "You can have at most 10 recipients in one order.",
"recipientsUnknown": "One item points to a recipient that no longer exists.",
"recipientsSendMultiple": "Send to multiple recipients"
```
Provide the corresponding Arabic (`ar.json`) and French (`fr.json`) translations for the same keys.

- [ ] **Step 4: Email template — enumerate groups**

Locate the order-received template (grep `delivery_date` and `orderNumber` under `features/notifications`). Pass an optional `groups` array into the template rendering; when present, render a "Deliveries" list (recipient name, address, date, window) instead of the single recipient/date line. Keep the single-recipient rendering when `groups` is absent. The notification delivery call in `app/api/orders/route.ts` already has the order id; fetch groups via `fetchOrderDeliveryGroups` and include them in the notification payload.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/domain/i18n-dictionary.test.ts tests/domain/email-templates.test.ts`
Expected: all PASS.

- [ ] **Step 6: Full lint + typecheck**

Run: `npx tsc --noEmit; if ($?) { npx eslint . }`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add features/i18n/locales/en.json features/i18n/locales/ar.json features/i18n/locales/fr.json features/notifications tests/domain/i18n-dictionary.test.ts tests/domain/email-templates.test.ts
git commit -m "feat(i18n,email): recipient group copy and group enumeration in confirmation email"
```

---

## Self-Review Notes

- **Spec coverage:** every spec section maps to a task — §1 cart model/UX (Tasks 2–4), §2 checkout (Tasks 5, 7), §3 schema+RPC (Tasks 1, 6), §4 tracking/admin/email (Tasks 8, 9, 12), §5 edge cases (Task 12 abandoned-cart is unchanged by design; Task 10 refund cap covers the promo/gift-card guard), §6 testing (each task). Change-request date rejection = Task 11. Out-of-scope items are intentionally not coded.
- **Consistency:** `createRecipientId`, `MAX_GROUPS`, `deliveryFeeForGroups`, `checkoutDeliveryFeeMinor`, `validateRecipientGroups`, `buildGroupPayload`, `buildLinesPayload`, `deriveOrderStatus`, `normalizeGroups`, `groupRefundForCancellation`, `diffTouchesGroupOwnedField` are each defined once and reused by name across tasks. The RPC reads `p_groups[i].recipientName` (spec §3) and `p_lines[i].groupIndex`, matching `buildLinesPayload`/`buildGroupPayload`.
- **Placeholders:** none — every code step shows concrete test + implementation.