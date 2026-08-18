# Order Change Requests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let customers request changes to an existing order (delivery date/window, recipient name/phone, delivery address, per-item gift messages and quantities) with a two-tier flow — instant apply for confirmed-unpaid orders, admin review otherwise — and automatic handling of the price delta (charge via Paymob when the new total is higher, refund via the Paymob refund API when lower).

**Architecture:** A new `order_change_requests` table (partial-diff jsonb + status machine) backed by pure, tested logic (`canRequestChange`/`requiresReview`/`parseChangeRequestDiff`/`applyChanges`). A service module mirrors `cancel-actions.ts`: `submitChangeRequest` (instant vs review tier), `reviewChangeRequest` (admin approve/reject with the delta money flow), `payChangeRequestDelta` (fresh Paymob intention for the owed delta), and `handleChangePaymentCallback` (webhook branch that records the delta payment and applies the change). Account form + status cards on the order page; `/admin/change-requests` queue mirroring the cancel-requests page.

**Tech Stack:** Next.js App Router (server components + client components), Supabase (PostgREST client, RLS), Paymob (intentions + refund API), Vitest + Testing Library, existing shadcn/ui components.

**Spec:** `docs/superpowers/specs/2026-08-18-order-change-requests-design.md` — the plan argues from the spec; executors read both.

## Global Constraints

- Money touches **only `paid` orders**. `delta > 0` → Paymob intention (special_reference `change:{requestId}`), applied only when the webhook confirms payment; `delta < 0` → refund-first block-approval via `refundPaymobTransaction`; `delta = 0` or unpaid → apply with no money calls.
- `requiresReview` is **identical to cancellations**: `paymentStatus === 'paid' || fulfillmentStatus !== 'confirmed'`.
- The `changes` diff is validated at submit **and re-validated at apply** (`parseChangeRequestDiff` + `applyChanges`); never trust the stored jsonb.
- Line-item prices come from the order's own `order_items.unit_price_minor` (order-time prices), never the live catalog. `delivery_fee_minor` and `discount_minor` are fixed.
- `delivery_city_code`, product add/remove, and variant changes are not changeable.
- i18n: every new key in all three locales (EN/AR/FR) — `tests/domain/i18n-dictionary.test.ts` enforces parity.
- Emails go through `deliverOrderNotification` (best-effort; a failed email must never break the state mutation).
- A pending **cancellation** request also blocks a new change request (`hasPendingRequest` covers both tables).
- TDD: write the failing test first, verify it fails, implement, verify it passes, commit per task.
- Money amounts are integers in minor units (EGP piastres).

---

### Task 1: Migration 011 + pure eligibility & diff parsing

**Files:**
- Create: `supabase/migrations/011_order_change_requests.sql`
- Create: `features/orders/change-request.ts`
- Test: `tests/domain/change-request.test.ts`

**Interfaces:**
- Produces (used by Tasks 2–7):
  - `export type ChangeRequestDiff = { delivery_date?: string; delivery_window?: string; recipient_name?: string; recipient_phone?: string; delivery_address?: string; items?: Array<{ id: string; quantity?: number; gift_message?: string }> }`
  - `export type ChangeEligibility = 'ok' | 'not_found' | 'not_changeable' | 'request_pending'`
  - `export function canRequestChange(order: { fulfillmentStatus: string; paymentStatus: string; hasPendingRequest: boolean } | null): ChangeEligibility`
  - `export function requiresReview(order: { fulfillmentStatus: string; paymentStatus: string }): boolean`
  - `export function parseChangeRequestDiff(value: unknown): { ok: true; diff: ChangeRequestDiff } | { ok: false; error: string }` — errors: `'invalid'`, `'invalid_date'`, `'invalid_quantity'`, `'empty_diff'`

- [ ] **Step 1: Write the failing test**

`tests/domain/change-request.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { canRequestChange, parseChangeRequestDiff, requiresReview } from '@/features/orders/change-request';

describe('canRequestChange', () => {
  it('returns not_found when the order is missing', () => {
    expect(canRequestChange(null)).toBe('not_found');
  });
  it('returns request_pending when a request is already pending', () => {
    expect(canRequestChange({ fulfillmentStatus: 'confirmed', paymentStatus: 'pending', hasPendingRequest: true })).toBe('request_pending');
  });
  it('returns not_changeable when the order was cancelled', () => {
    expect(canRequestChange({ fulfillmentStatus: 'cancelled', paymentStatus: 'pending', hasPendingRequest: false })).toBe('not_changeable');
  });
  it('returns not_changeable when the order was delivered', () => {
    expect(canRequestChange({ fulfillmentStatus: 'delivered', paymentStatus: 'paid', hasPendingRequest: false })).toBe('not_changeable');
  });
  it('returns not_changeable when the payment was refunded', () => {
    expect(canRequestChange({ fulfillmentStatus: 'confirmed', paymentStatus: 'refunded', hasPendingRequest: false })).toBe('not_changeable');
  });
  it('returns ok for a confirmed, unpaid order', () => {
    expect(canRequestChange({ fulfillmentStatus: 'confirmed', paymentStatus: 'pending', hasPendingRequest: false })).toBe('ok');
  });
});

describe('requiresReview', () => {
  it('reviews paid orders', () => {
    expect(requiresReview({ fulfillmentStatus: 'confirmed', paymentStatus: 'paid' })).toBe(true);
  });
  it('reviews mid-fulfillment orders even when unpaid', () => {
    expect(requiresReview({ fulfillmentStatus: 'preparing', paymentStatus: 'pending' })).toBe(true);
  });
  it('auto-applies confirmed unpaid orders', () => {
    expect(requiresReview({ fulfillmentStatus: 'confirmed', paymentStatus: 'pending' })).toBe(false);
  });
});

describe('parseChangeRequestDiff', () => {
  it('accepts a valid diff', () => {
    const result = parseChangeRequestDiff({ delivery_date: '2026-08-20', delivery_window: '17:00-19:00', items: [{ id: 'i1', quantity: 3, gift_message: 'hi' }] });
    expect(result).toEqual({ ok: true, diff: { delivery_date: '2026-08-20', delivery_window: '17:00-19:00', items: [{ id: 'i1', quantity: 3, gift_message: 'hi' }] } });
  });
  it('rejects an empty diff', () => {
    expect(parseChangeRequestDiff({})).toEqual({ ok: false, error: 'empty_diff' });
  });
  it('rejects a non-object payload', () => {
    expect(parseChangeRequestDiff('nope')).toEqual({ ok: false, error: 'invalid' });
  });
  it('rejects an invalid date', () => {
    expect(parseChangeRequestDiff({ delivery_date: 'tomorrow' })).toEqual({ ok: false, error: 'invalid_date' });
  });
  it('rejects a zero, fractional, or non-numeric quantity', () => {
    expect(parseChangeRequestDiff({ items: [{ id: 'i1', quantity: 0 }] })).toEqual({ ok: false, error: 'invalid_quantity' });
    expect(parseChangeRequestDiff({ items: [{ id: 'i1', quantity: 1.5 }] })).toEqual({ ok: false, error: 'invalid_quantity' });
    expect(parseChangeRequestDiff({ items: [{ id: 'i1', quantity: '2' }] })).toEqual({ ok: false, error: 'invalid_quantity' });
  });
  it('rejects an item entry with nothing to change', () => {
    expect(parseChangeRequestDiff({ items: [{ id: 'i1' }] })).toEqual({ ok: false, error: 'invalid' });
  });
  it('rejects unknown keys (city is not changeable)', () => {
    expect(parseChangeRequestDiff({ delivery_city_code: 'cai' })).toEqual({ ok: false, error: 'invalid' });
  });
  it('trims and keeps only non-empty strings', () => {
    expect(parseChangeRequestDiff({ recipient_name: '  Sam  ' })).toEqual({ ok: true, diff: { recipient_name: 'Sam' } });
    expect(parseChangeRequestDiff({ recipient_name: '   ' })).toEqual({ ok: false, error: 'invalid' });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/domain/change-request.test.ts`
Expected: FAIL with "Cannot find module '@/features/orders/change-request'".

- [ ] **Step 3: Create the migration**

`supabase/migrations/011_order_change_requests.sql`:

```sql
-- Customer order change requests. Customers read their own rows; submit and
-- review both run through the service-role client (the changes diff needs
-- server-side validation a raw RLS insert cannot enforce).
create table if not exists public.order_change_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  customer_id uuid not null references public.profiles(id),
  -- Partial diff: only the fields being changed. Validated at submit and
  -- re-validated when the change is applied.
  changes jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'applied', 'rejected')),
  reason text,
  -- Computed at approval/apply: new total - old total (minor units).
  delta_minor integer,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists order_change_requests_order_idx on public.order_change_requests(order_id);
create index if not exists order_change_requests_status_idx on public.order_change_requests(status);
create index if not exists order_change_requests_customer_idx on public.order_change_requests(customer_id);

alter table public.order_change_requests enable row level security;

create policy "customers read own change requests" on public.order_change_requests
  for select using (customer_id = auth.uid());
```

- [ ] **Step 4: Write the minimal implementation**

`features/orders/change-request.ts`:

```ts
export type ChangeRequestDiff = {
  delivery_date?: string;
  delivery_window?: string;
  recipient_name?: string;
  recipient_phone?: string;
  delivery_address?: string;
  items?: Array<{ id: string; quantity?: number; gift_message?: string }>;
};

export type ChangeEligibility = 'ok' | 'not_found' | 'not_changeable' | 'request_pending';

const FIELD_KEYS = ['delivery_date', 'delivery_window', 'recipient_name', 'recipient_phone', 'delivery_address'] as const;
const ITEM_KEYS = ['id', 'quantity', 'gift_message'] as const;

export function canRequestChange(order: { fulfillmentStatus: string; paymentStatus: string; hasPendingRequest: boolean } | null): ChangeEligibility {
  if (!order) return 'not_found';
  if (order.hasPendingRequest) return 'request_pending';
  if (order.fulfillmentStatus === 'cancelled' || order.fulfillmentStatus === 'delivered') return 'not_changeable';
  if (order.paymentStatus === 'refunded') return 'not_changeable';
  return 'ok';
}

export function requiresReview(order: { fulfillmentStatus: string; paymentStatus: string }): boolean {
  return order.paymentStatus === 'paid' || order.fulfillmentStatus !== 'confirmed';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cleanString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

export function parseChangeRequestDiff(value: unknown): { ok: true; diff: ChangeRequestDiff } | { ok: false; error: string } {
  if (!isRecord(value)) return { ok: false, error: 'invalid' };
  for (const key of Object.keys(value)) {
    if (!(FIELD_KEYS as readonly string[]).includes(key) && key !== 'items') return { ok: false, error: 'invalid' };
  }
  const diff: ChangeRequestDiff = {};
  for (const key of FIELD_KEYS) {
    if (value[key] !== undefined) {
      const cleaned = cleanString(value[key]);
      if (!cleaned) return { ok: false, error: 'invalid' };
      if (key === 'delivery_date' && !/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) return { ok: false, error: 'invalid_date' };
      (diff as Record<string, string>)[key] = cleaned;
    }
  }
  if (value.items !== undefined) {
    if (!Array.isArray(value.items)) return { ok: false, error: 'invalid' };
    const items: NonNullable<ChangeRequestDiff['items']> = [];
    for (const raw of value.items) {
      if (!isRecord(raw)) return { ok: false, error: 'invalid' };
      for (const key of Object.keys(raw)) {
        if (!(ITEM_KEYS as readonly string[]).includes(key)) return { ok: false, error: 'invalid' };
      }
      const id = cleanString(raw.id);
      if (!id) return { ok: false, error: 'invalid' };
      const entry: { id: string; quantity?: number; gift_message?: string } = { id };
      if (raw.quantity !== undefined) {
        if (typeof raw.quantity !== 'number' || !Number.isInteger(raw.quantity) || raw.quantity < 1) return { ok: false, error: 'invalid_quantity' };
        entry.quantity = raw.quantity;
      }
      if (raw.gift_message !== undefined) {
        const message = cleanString(raw.gift_message);
        if (message === null) return { ok: false, error: 'invalid' };
        entry.gift_message = message;
      }
      if (entry.quantity === undefined && entry.gift_message === undefined) return { ok: false, error: 'invalid' };
      items.push(entry);
    }
    diff.items = items;
  }
  if (Object.keys(diff).length === 0) return { ok: false, error: 'empty_diff' };
  return { ok: true, diff };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/domain/change-request.test.ts`
Expected: PASS (17/17).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/011_order_change_requests.sql features/orders/change-request.ts tests/domain/change-request.test.ts
git commit -m "feat: order change request migration, eligibility, and diff parsing"
```

---

### Task 2: `applyChanges` money math

**Files:**
- Modify: `features/orders/change-request.ts` (append to the file from Task 1)
- Test: `tests/domain/apply-changes.test.ts`

**Interfaces:**
- Consumes: `ChangeRequestDiff` (Task 1)
- Produces (used by Task 3 service, Task 6 queue delta preview):
  - `export type ApplyChangesResult = { ok: true; fields: ChangeRequestDiff; items: Array<{ id: string; unit_price_minor: number; quantity: number; gift_message: string }>; subtotalMinor: number; totalMinor: number; deltaMinor: number } | { ok: false; reason: string }`
  - `export function applyChanges(order: { subtotal_minor: number; delivery_fee_minor: number; discount_minor: number | null; total_minor: number }, items: Array<{ id: string; unit_price_minor: number; quantity: number; gift_message: string }>, diff: ChangeRequestDiff): ApplyChangesResult`

- [ ] **Step 1: Write the failing test**

`tests/domain/apply-changes.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { applyChanges } from '@/features/orders/change-request';

const order = { subtotal_minor: 10000, delivery_fee_minor: 1500, discount_minor: 0, total_minor: 11500 };
const items = [
  { id: 'i1', unit_price_minor: 6000, quantity: 1, gift_message: '' },
  { id: 'i2', unit_price_minor: 4000, quantity: 1, gift_message: 'hi' },
];

describe('applyChanges', () => {
  it('applies field-only diffs with no delta', () => {
    const result = applyChanges(order, items, { delivery_date: '2026-08-20' });
    expect(result).toEqual({ ok: true, fields: { delivery_date: '2026-08-20' }, items, subtotalMinor: 10000, totalMinor: 11500, deltaMinor: 0 });
  });

  it('increases the total when a quantity goes up', () => {
    const result = applyChanges(order, items, { items: [{ id: 'i1', quantity: 2 }] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.subtotalMinor).toBe(16000);
    expect(result.totalMinor).toBe(17500);
    expect(result.deltaMinor).toBe(6000);
    expect(result.items[0]).toEqual({ id: 'i1', unit_price_minor: 6000, quantity: 2, gift_message: '' });
    expect(result.items[1]).toEqual(items[1]);
  });

  it('reduces the total when a quantity goes down', () => {
    const result = applyChanges(order, items, { items: [{ id: 'i2', quantity: 1, gift_message: '' }] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.subtotalMinor).toBe(6000);
    expect(result.totalMinor).toBe(7500);
    expect(result.deltaMinor).toBe(-4000);
  });

  it('keeps the total unchanged for a gift-message-only edit', () => {
    const result = applyChanges(order, items, { items: [{ id: 'i2', gift_message: 'lots of love' }] });
    expect(result).toEqual({ ok: true, fields: {}, items: [{ ...items[0] }, { ...items[1], gift_message: 'lots of love' }], subtotalMinor: 10000, totalMinor: 11500, deltaMinor: 0 });
  });

  it('applies a discount when computing the total', () => {
    const result = applyChanges({ ...order, discount_minor: 1000 }, items, { delivery_window: '17:00-19:00' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.totalMinor).toBe(10500);
  });

  it('rejects an unknown item id', () => {
    const result = applyChanges(order, items, { items: [{ id: 'nope', quantity: 2 }] });
    expect(result).toEqual({ ok: false, reason: 'unknown_item' });
  });

  it('re-validates quantities defensively (stored junk)', () => {
    expect(applyChanges(order, items, { items: [{ id: 'i1', quantity: 0 }] })).toEqual({ ok: false, reason: 'invalid_quantity' });
    expect(applyChanges(order, items, { items: [{ id: 'i1', quantity: 1.5 }] })).toEqual({ ok: false, reason: 'invalid_quantity' });
  });

  it('does not mutate the input items', () => {
    const before = JSON.stringify(items);
    applyChanges(order, items, { items: [{ id: 'i1', quantity: 3 }] });
    expect(JSON.stringify(items)).toBe(before);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/domain/apply-changes.test.ts`
Expected: FAIL with "applyChanges is not a function".

- [ ] **Step 3: Implement `applyChanges`**

Append to `features/orders/change-request.ts`:

```ts
export type ApplyChangesResult =
  | { ok: true; fields: ChangeRequestDiff; items: Array<{ id: string; unit_price_minor: number; quantity: number; gift_message: string }>; subtotalMinor: number; totalMinor: number; deltaMinor: number }
  | { ok: false; reason: string };

export function applyChanges(
  order: { subtotal_minor: number; delivery_fee_minor: number; discount_minor: number | null; total_minor: number },
  items: Array<{ id: string; unit_price_minor: number; quantity: number; gift_message: string }>,
  diff: ChangeRequestDiff,
): ApplyChangesResult {
  const fields: ChangeRequestDiff = {};
  for (const key of ['delivery_date', 'delivery_window', 'recipient_name', 'recipient_phone', 'delivery_address'] as const) {
    if (diff[key] !== undefined) fields[key] = diff[key];
  }
  const updated = items.map((item) => ({ ...item }));
  for (const change of diff.items ?? []) {
    const target = updated.find((item) => item.id === change.id);
    if (!target) return { ok: false, reason: 'unknown_item' };
    if (change.quantity !== undefined) {
      if (typeof change.quantity !== 'number' || !Number.isInteger(change.quantity) || change.quantity < 1) return { ok: false, reason: 'invalid_quantity' };
      target.quantity = change.quantity;
    }
    if (change.gift_message !== undefined) target.gift_message = change.gift_message.trim();
  }
  const subtotalMinor = updated.reduce((sum, item) => sum + item.unit_price_minor * item.quantity, 0);
  const totalMinor = subtotalMinor + order.delivery_fee_minor - (order.discount_minor ?? 0);
  const deltaMinor = totalMinor - order.total_minor;
  return { ok: true, fields, items: updated, subtotalMinor, totalMinor, deltaMinor };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/domain/change-request.test.ts tests/domain/apply-changes.test.ts`
Expected: PASS (25/25).

- [ ] **Step 5: Commit**

```bash
git add features/orders/change-request.ts tests/domain/apply-changes.test.ts
git commit -m "feat: applyChanges recomputes order totals and the price delta"
```

---

### Task 3: Change-request service + API routes

**Files:**
- Create: `features/orders/change-request-service.ts`
- Create: `app/api/account/orders/[id]/change-request/route.ts`
- Create: `app/api/account/change-requests/[id]/pay/route.ts`
- Create: `app/api/admin/change-requests/[id]/route.ts`
- Test: `tests/domain/change-request-service.test.ts`

**Interfaces:**
- Consumes: `ChangeRequestDiff`, `ChangeEligibility`, `canRequestChange`, `requiresReview`, `parseChangeRequestDiff`, `applyChanges` (Tasks 1–2); `deliverOrderNotification`, `refundPaymobTransaction`, `createPaymobIntention`, `AdminIdentity`.
- Produces (used by Task 4 webhook + Task 5/6 routes/pages):
  - `export type SubmitChangeRequestResult = { status: 'applied'; deltaMinor: number } | { status: 'created'; requestId: string } | { status: 'ineligible'; reason: Exclude<ChangeEligibility, 'ok'> } | { status: 'invalid'; error: string } | { status: 'not_found' } | { status: 'failure' }`
  - `export async function submitChangeRequest(client, input: { customerId: string; orderId: string; changes: unknown; reason?: string }, deps: { deliver?: typeof deliverOrderNotification; orderUrlBase?: string }): Promise<SubmitChangeRequestResult>`
  - `export type ReviewChangeResult = { status: 'approved'; deltaMinor: number } | { status: 'applied'; deltaMinor: number } | { status: 'rejected' } | { status: 'not_found' } | { status: 'not_applicable' } | { status: 'refund_failed' } | { status: 'failure' }`
  - `export async function reviewChangeRequest(client, input: { admin: AdminIdentity; requestId: string; action: 'approve' | 'reject'; reason?: string; orderUrlBase: string }, deps: { deliver?: typeof deliverOrderNotification; refund?: typeof refundPaymobTransaction }): Promise<ReviewChangeResult>`
  - `export async function handleChangePaymentCallback(client, transaction: Record<string, any>, deps: { deliver?: typeof deliverOrderNotification; orderUrlBase?: string }): Promise<{ handled: boolean }>` — returns `{ handled: false }` only when the reference is not a `change:` reference; never throws.
  - `export type PayDeltaResult = { status: 'ok'; checkoutUrl: string } | { status: 'not_found' } | { status: 'not_payable' } | { status: 'failure' }`
  - `export async function payChangeRequestDelta(client, input: { customerId: string; requestId: string }, deps: { origin: string; createIntention?: (input: Omit<CreatePaymentInput, 'integrationId'>) => Promise<{ providerReference: string; checkoutUrl: string }> }): Promise<PayDeltaResult>`

- [ ] **Step 1: Write the failing test**

`tests/domain/change-request-service.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleChangePaymentCallback, payChangeRequestDelta, reviewChangeRequest, submitChangeRequest } from '@/features/orders/change-request-service';

const orderRow = {
  id: 'o1', display_number: 'RO-1', fulfillment_status: 'confirmed', payment_status: 'pending',
  customer_id: 'c1', customer_email: 'buyer@example.com', locale: 'en',
  total_minor: 11500, subtotal_minor: 10000, delivery_fee_minor: 1500, discount_minor: null, public_token: 'tok',
  recipient_name: 'Sam', recipient_phone: '+20 1', delivery_address: 'Street 1', delivery_date: '2026-08-19', delivery_window: '17:00-19:00',
  order_items: [
    { id: 'i1', unit_price_minor: 6000, quantity: 1, gift_message: '' },
    { id: 'i2', unit_price_minor: 4000, quantity: 1, gift_message: 'hi' },
  ],
};

const deliver = vi.fn().mockResolvedValue({ accepted: true });
const refund = vi.fn().mockResolvedValue({ ok: true, refundTransactionId: 'refund-1' });
const createIntention = vi.fn().mockResolvedValue({ providerReference: 'int-1', checkoutUrl: 'https://pay.example/checkout' });

beforeEach(() => { deliver.mockClear(); refund.mockClear(); createIntention.mockClear(); });

// ---- submitChangeRequest ----

function submitClient(options: { order?: unknown; pendingChange?: unknown; pendingCancel?: unknown } = {}) {
  const calls: Array<{ table: string; op: string; payload?: unknown }> = [];
  let requestId = 'req-1';
  const client = {
    from: (table: string) => ({
      select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => {
        if (table === 'orders') return { data: options.order ?? null, error: null };
        if (table === 'order_change_requests') return { data: options.pendingChange ?? null, error: null };
        return { data: options.pendingCancel ?? null, error: null };
      } }) }) }),
      insert: (payload: unknown) => { calls.push({ table, op: 'insert', payload }); return { select: () => ({ single: async () => ({ data: { id: requestId }, error: null }) }) }; },
      update: (payload: unknown) => { calls.push({ table, op: 'update', payload }); return { eq: () => ({ error: null }) }; },
    }),
  };
  return { client, calls };
}

describe('submitChangeRequest', () => {
  it('returns not_found when the order does not belong to the customer', async () => {
    const { client } = submitClient({ order: null });
    expect(await submitChangeRequest(client, { customerId: 'c1', orderId: 'o1', changes: { delivery_date: '2026-08-20' } }, { deliver })).toEqual({ status: 'not_found' });
  });

  it('returns invalid for a malformed diff', async () => {
    const { client } = submitClient({ order: orderRow });
    expect(await submitChangeRequest(client, { customerId: 'c1', orderId: 'o1', changes: {} }, { deliver })).toEqual({ status: 'invalid', error: 'empty_diff' });
  });

  it('blocks when a pending cancellation exists for the order', async () => {
    const { client } = submitClient({ order: orderRow, pendingCancel: { id: 'cr-1' } });
    expect(await submitChangeRequest(client, { customerId: 'c1', orderId: 'o1', changes: { delivery_date: '2026-08-20' } }, { deliver })).toEqual({ status: 'ineligible', reason: 'request_pending' });
  });

  it('auto-applies a confirmed unpaid order and emails change_approved', async () => {
    const { client, calls } = submitClient({ order: orderRow, pendingChange: null, pendingCancel: null });
    const result = await submitChangeRequest(client, { customerId: 'c1', orderId: 'o1', changes: { items: [{ id: 'i1', quantity: 2 }] }, reason: 'more stems' }, { deliver, orderUrlBase: 'https://example.com' });
    expect(result).toEqual({ status: 'applied', deltaMinor: 6000 });
    expect(calls).toContainEqual(expect.objectContaining({ table: 'order_change_requests', op: 'insert', payload: expect.objectContaining({ status: 'applied', delta_minor: 6000, changes: { items: [{ id: 'i1', quantity: 2 }] } }) }));
    expect(calls).toContainEqual(expect.objectContaining({ table: 'orders', op: 'update', payload: expect.objectContaining({ subtotal_minor: 16000, total_minor: 17500 }) }));
    expect(calls).toContainEqual(expect.objectContaining({ table: 'order_items', op: 'update', payload: expect.objectContaining({ quantity: 2 }) }));
    expect(deliver).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ type: 'change_approved' }), expect.anything());
  });

  it('queues a pending request for a paid order without applying', async () => {
    const { client, calls } = submitClient({ order: { ...orderRow, payment_status: 'paid' }, pendingChange: null, pendingCancel: null });
    const result = await submitChangeRequest(client, { customerId: 'c1', orderId: 'o1', changes: { delivery_date: '2026-08-20' } }, { deliver });
    expect(result).toEqual({ status: 'created', requestId: 'req-1' });
    expect(calls).toContainEqual(expect.objectContaining({ table: 'order_change_requests', op: 'insert', payload: expect.objectContaining({ status: 'pending' }) }));
    expect(calls.filter((call) => call.table === 'orders' && call.op === 'update')).toEqual([]);
    expect(deliver).not.toHaveBeenCalled();
  });
});

// ---- reviewChangeRequest ----

const admin = { userId: 'a1', role: 'admin' as const };
const paidPayment = { id: 'pay-1', provider_reference: 'txn-1', amount_minor: 11500, status: 'paid' };

function requestWithOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'req-1', status: 'pending', reason: null, changes: { items: [{ id: 'i1', quantity: 2 }] }, delta_minor: null,
    orders: { ...orderRow, fulfillment_status: 'preparing', payment_status: 'paid', payments: [paidPayment], order_items: orderRow.order_items },
    ...overrides,
  };
}

// i2 starts at quantity 2, so dropping it to 1 yields delta = -4000.
function downRequest(overrides: Record<string, unknown> = {}) {
  return requestWithOrder({
    changes: { items: [{ id: 'i2', quantity: 1, gift_message: '' }] },
    orders: { ...requestWithOrder().orders, order_items: [{ id: 'i1', unit_price_minor: 6000, quantity: 1, gift_message: '' }, { id: 'i2', unit_price_minor: 4000, quantity: 2, gift_message: 'hi' }] },
    ...overrides,
  });
}

function reviewClient(request: unknown) {
  const calls: Array<{ table: string; op: string; payload?: unknown }> = [];
  const client = {
    from: (table: string) => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: request, error: null }) }) }),
      update: (payload: unknown) => { calls.push({ table, op: 'update', payload }); return { eq: () => ({ error: null }) }; },
      insert: (payload: unknown) => { calls.push({ table, op: 'insert', payload }); return { error: null }; },
    }),
  };
  return { client, calls };
}

const reviewInput = { admin, requestId: 'req-1', action: 'approve' as const, orderUrlBase: 'https://example.com' };

describe('reviewChangeRequest', () => {
  it('returns not_found when the request is missing', async () => {
    const { client } = reviewClient(null);
    expect(await reviewChangeRequest(client, reviewInput, { deliver, refund })).toEqual({ status: 'not_found' });
  });

  it('returns not_applicable when the request was already applied', async () => {
    const { client } = reviewClient(requestWithOrder({ status: 'applied' }));
    expect(await reviewChangeRequest(client, reviewInput, { deliver, refund })).toEqual({ status: 'not_applicable' });
  });

  it('approves a paid delta>0 request as awaiting payment, without touching the order', async () => {
    const { client, calls } = reviewClient(requestWithOrder());
    const result = await reviewChangeRequest(client, reviewInput, { deliver, refund });
    expect(result).toEqual({ status: 'approved', deltaMinor: 6000 });
    expect(calls).toContainEqual(expect.objectContaining({ table: 'order_change_requests', op: 'update', payload: expect.objectContaining({ status: 'approved', delta_minor: 6000, reviewed_by: 'a1' }) }));
    expect(calls.filter((call) => call.table === 'orders' && call.op === 'update')).toEqual([]);
    expect(refund).not.toHaveBeenCalled();
    expect(deliver).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ type: 'change_payment_required' }), expect.anything());
  });

  it('refunds the delta and applies for a paid delta<0 request', async () => {
    const { client, calls } = reviewClient(downRequest());
    const result = await reviewChangeRequest(client, reviewInput, { deliver, refund });
    expect(result).toEqual({ status: 'applied', deltaMinor: -4000 });
    expect(refund).toHaveBeenCalledWith({ transactionId: 'txn-1', amountMinor: 4000 });
    expect(calls).toContainEqual(expect.objectContaining({ table: 'payments', op: 'insert', payload: expect.objectContaining({ status: 'refunded', amount_minor: 4000, idempotency_key: 'change-refund:req-1' }) }));
    expect(calls).toContainEqual(expect.objectContaining({ table: 'orders', op: 'update', payload: expect.objectContaining({ total_minor: 7500 }) }));
    expect(calls).toContainEqual(expect.objectContaining({ table: 'order_change_requests', op: 'update', payload: expect.objectContaining({ status: 'applied', delta_minor: -4000 }) }));
    expect(deliver).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ type: 'change_approved' }), expect.anything());
  });

  it('blocks approval when the refund fails, leaving the request pending', async () => {
    refund.mockResolvedValueOnce({ ok: false, error: 'Paymob refund failed with status 400' });
    const { client, calls } = reviewClient(downRequest());
    const result = await reviewChangeRequest(client, reviewInput, { deliver, refund });
    expect(result).toEqual({ status: 'refund_failed' });
    expect(calls.filter((call) => call.table === 'orders' && call.op === 'update')).toEqual([]);
    expect(calls.filter((call) => call.table === 'order_change_requests' && call.op === 'update')).toEqual([]);
    expect(deliver).not.toHaveBeenCalled();
  });

  it('blocks approval when the order is paid but has no refundable payment row', async () => {
    const { client } = reviewClient(requestWithOrder({ orders: { ...requestWithOrder().orders, payments: [] } }));
    const result = await reviewChangeRequest(client, reviewInput, { deliver, refund });
    expect(result).toEqual({ status: 'refund_failed' });
    expect(refund).not.toHaveBeenCalled();
  });

  it('applies an unpaid order immediately with no money calls', async () => {
    const unpaid = requestWithOrder({ orders: { ...requestWithOrder().orders, payment_status: 'pending', fulfillment_status: 'confirmed' } });
    const { client } = reviewClient(unpaid);
    const result = await reviewChangeRequest(client, reviewInput, { deliver, refund });
    expect(result).toEqual({ status: 'applied', deltaMinor: 6000 });
    expect(refund).not.toHaveBeenCalled();
  });

  it('rejects the request and emails change_rejected', async () => {
    const { client, calls } = reviewClient(requestWithOrder());
    const result = await reviewChangeRequest(client, { ...reviewInput, action: 'reject', reason: 'too late' }, { deliver });
    expect(result).toEqual({ status: 'rejected' });
    expect(calls).toContainEqual(expect.objectContaining({ table: 'order_change_requests', op: 'update', payload: expect.objectContaining({ status: 'rejected', reason: 'too late', reviewed_by: 'a1' }) }));
    expect(deliver).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ type: 'change_rejected' }), expect.anything());
  });

  it('allows rejecting an approved (awaiting payment) request', async () => {
    const { client } = reviewClient(requestWithOrder({ status: 'approved' }));
    expect(await reviewChangeRequest(client, { ...reviewInput, action: 'reject' }, { deliver })).toEqual({ status: 'rejected' });
  });
});

// ---- handleChangePaymentCallback ----

const successTransaction = { id: 'pay-txn-1', success: true, amount_cents: 6000, currency: 'EGP', order: { special_reference: 'change:req-1' } };

describe('handleChangePaymentCallback', () => {
  it('returns handled:false for a non-change reference', async () => {
    const { client } = reviewClient(null);
    expect(await handleChangePaymentCallback(client, { order: { special_reference: 'RO-1' } }, { deliver })).toEqual({ handled: false });
  });

  it('ignores callbacks for unknown request ids', async () => {
    const { client } = reviewClient(null);
    expect(await handleChangePaymentCallback(client, successTransaction, { deliver })).toEqual({ handled: true });
    expect(deliver).not.toHaveBeenCalled();
  });

  it('ignores callbacks when the request is not awaiting payment', async () => {
    const { client, calls } = reviewClient(requestWithOrder({ status: 'applied' }));
    expect(await handleChangePaymentCallback(client, successTransaction, { deliver })).toEqual({ handled: true });
    expect(calls.filter((call) => call.table === 'payments' && call.op === 'insert')).toEqual([]);
  });

  it('records the delta payment, applies the change, and emails change_approved', async () => {
    const { client, calls } = reviewClient(requestWithOrder());
    const result = await handleChangePaymentCallback(client, successTransaction, { deliver, orderUrlBase: 'https://example.com' });
    expect(result).toEqual({ handled: true });
    expect(calls).toContainEqual(expect.objectContaining({ table: 'payments', op: 'insert', payload: expect.objectContaining({ status: 'paid', amount_minor: 6000, idempotency_key: 'change-pay:pay-txn-1:success' }) }));
    expect(calls).toContainEqual(expect.objectContaining({ table: 'orders', op: 'update', payload: expect.objectContaining({ total_minor: 17500 }) }));
    expect(calls).toContainEqual(expect.objectContaining({ table: 'order_change_requests', op: 'update', payload: expect.objectContaining({ status: 'applied' }) }));
    expect(deliver).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ type: 'change_approved' }), expect.anything());
  });

  it('does not apply when the amount does not match the stored delta', async () => {
    const { client, calls } = reviewClient(requestWithOrder());
    await handleChangePaymentCallback(client, { ...successTransaction, amount_cents: 100 }, { deliver });
    expect(calls.filter((call) => call.table === 'payments' && call.op === 'insert')).toEqual([]);
    expect(calls.filter((call) => call.table === 'orders' && call.op === 'update')).toEqual([]);
  });

  it('does not apply when the payment failed', async () => {
    const { client, calls } = reviewClient(requestWithOrder());
    await handleChangePaymentCallback(client, { ...successTransaction, success: false }, { deliver });
    expect(calls.filter((call) => call.table === 'orders' && call.op === 'update')).toEqual([]);
  });
});

// ---- payChangeRequestDelta ----

function payClient(request: unknown) {
  const client = {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: request, error: null }) }) }) }),
  };
  return { client };
}

describe('payChangeRequestDelta', () => {
  it('returns not_found for another customer\u2019s request', async () => {
    const { client } = payClient({ id: 'req-1', status: 'approved', delta_minor: 6000, orders: { ...orderRow, customer_id: 'other' } });
    expect(await payChangeRequestDelta(client, { customerId: 'c1', requestId: 'req-1' }, { origin: 'https://example.com', createIntention })).toEqual({ status: 'not_found' });
  });

  it('returns not_payable when the request is not approved', async () => {
    const { client } = payClient({ id: 'req-1', status: 'pending', delta_minor: null, orders: orderRow });
    expect(await payChangeRequestDelta(client, { customerId: 'c1', requestId: 'req-1' }, { origin: 'https://example.com', createIntention })).toEqual({ status: 'not_payable' });
  });

  it('creates an intention for the delta and returns the checkout URL', async () => {
    const { client } = payClient({ id: 'req-1', status: 'approved', delta_minor: 6000, orders: { ...orderRow, customer_id: 'c1' } });
    const result = await payChangeRequestDelta(client, { customerId: 'c1', requestId: 'req-1' }, { origin: 'https://example.com', createIntention });
    expect(result).toEqual({ status: 'ok', checkoutUrl: 'https://pay.example/checkout' });
    expect(createIntention).toHaveBeenCalledWith(expect.objectContaining({ amountMinor: 6000, orderReference: 'change:req-1' }));
  });

  it('returns failure when the intention call throws', async () => {
    createIntention.mockRejectedValueOnce(new Error('boom'));
    const { client } = payClient({ id: 'req-1', status: 'approved', delta_minor: 6000, orders: { ...orderRow, customer_id: 'c1' } });
    expect(await payChangeRequestDelta(client, { customerId: 'c1', requestId: 'req-1' }, { origin: 'https://example.com', createIntention })).toEqual({ status: 'failure' });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/domain/change-request-service.test.ts`
Expected: FAIL with "Cannot find module '@/features/orders/change-request-service'".

- [ ] **Step 3: Implement the service**

`features/orders/change-request-service.ts`:

```ts
import { canRequestChange, requiresReview, parseChangeRequestDiff, applyChanges, type ChangeRequestDiff, type ChangeEligibility } from './change-request';
import { deliverOrderNotification } from '@/features/notifications/notification-delivery';
import type { AdminIdentity } from '@/features/admin/authorization';
import { refundPaymobTransaction, type PaymobRefundResult } from '@/features/payment/paymob-refund';
import { createPaymobIntention } from '@/features/payment/paymob-client';
import { getRequiredServerEnv } from '@/lib/server-env';
import type { CreatePaymentInput } from '@/features/payment/types';

type ChangeClient = { from: (table: string) => any };

const orderSelect = 'id,display_number,fulfillment_status,payment_status,customer_id,customer_email,locale,total_minor,subtotal_minor,delivery_fee_minor,discount_minor,public_token,recipient_name,recipient_phone,delivery_address,delivery_date,delivery_window';
const fullSelect = `${orderSelect},payments(id,provider_reference,amount_minor,status),order_items(id,unit_price_minor,quantity,gift_message)`;

type OrderRow = {
  id: string; display_number: string; fulfillment_status: string; payment_status: string;
  customer_id: string | null; customer_email: string | null; locale: 'en' | 'ar' | 'fr';
  total_minor: number; subtotal_minor: number; delivery_fee_minor: number; discount_minor: number | null;
  public_token: string | null; recipient_name: string; recipient_phone: string; delivery_address: string;
  delivery_date: string; delivery_window: string;
  payments?: Array<{ id: string; provider_reference: string | null; amount_minor: number; status: string }>;
  items: Array<{ id: string; unit_price_minor: number; quantity: number; gift_message: string }>;
};

function normalizeOrder(data: Record<string, any>): OrderRow {
  const { order_items, ...rest } = data;
  return { ...(rest as OrderRow), items: Array.isArray(order_items) ? order_items.map((item: any) => ({ id: String(item.id), unit_price_minor: Number(item.unit_price_minor), quantity: Number(item.quantity), gift_message: String(item.gift_message ?? '') })) : [] };
}

function emailBase(order: OrderRow, orderUrlBase: string) {
  return {
    orderId: order.id,
    recipient: order.customer_email ?? '',
    locale: order.locale,
    orderNumber: order.display_number,
    totalMinor: order.total_minor,
    subtotalMinor: order.subtotal_minor,
    deliveryFeeMinor: order.delivery_fee_minor,
    discountMinor: order.discount_minor ?? undefined,
    orderUrl: `${orderUrlBase.replace(/\/$/, '')}/orders/${order.id}?token=${encodeURIComponent(order.public_token ?? '')}`,
  };
}

async function applyChangeToOrder(client: ChangeClient, order: OrderRow, diff: ChangeRequestDiff, actorId: string | null): Promise<boolean> {
  const computed = applyChanges(order, order.items, diff);
  if (!computed.ok) return false;
  const now = new Date().toISOString();
  const { error: orderError } = await client.from('orders').update({ ...computed.fields, subtotal_minor: computed.subtotalMinor, total_minor: computed.totalMinor, updated_at: now }).eq('id', order.id);
  if (orderError) return false;
  for (const change of diff.items ?? []) {
    const item = computed.items.find((row) => row.id === change.id);
    if (!item) continue;
    const update: Record<string, unknown> = {};
    if (change.quantity !== undefined) update.quantity = item.quantity;
    if (change.gift_message !== undefined) update.gift_message = item.gift_message;
    const { error: itemError } = await client.from('order_items').update(update).eq('id', change.id);
    if (itemError) return false;
  }
  const { error: eventError } = await client.from('order_events').insert({ order_id: order.id, actor_id: actorId, event_type: 'change_applied', from_status: null, to_status: null, metadata: { delta_minor: computed.deltaMinor } });
  return !eventError;
}

export type SubmitChangeRequestResult =
  | { status: 'applied'; deltaMinor: number }
  | { status: 'created'; requestId: string }
  | { status: 'ineligible'; reason: Exclude<ChangeEligibility, 'ok'> }
  | { status: 'invalid'; error: string }
  | { status: 'not_found' }
  | { status: 'failure' };

export async function submitChangeRequest(
  client: ChangeClient,
  input: { customerId: string; orderId: string; changes: unknown; reason?: string },
  deps: { deliver?: typeof deliverOrderNotification; orderUrlBase?: string } = {},
): Promise<SubmitChangeRequestResult> {
  const deliver = deps.deliver ?? deliverOrderNotification;
  const parsed = parseChangeRequestDiff(input.changes);
  if (!parsed.ok) return { status: 'invalid', error: parsed.error };
  try {
    const { data } = await client.from('orders').select(fullSelect).eq('id', input.orderId).eq('customer_id', input.customerId).maybeSingle();
    if (!data) return { status: 'not_found' };
    const order = normalizeOrder(data);
    const [{ data: pendingChange }, { data: pendingCancel }] = await Promise.all([
      client.from('order_change_requests').select('id').eq('order_id', order.id).eq('status', 'pending').maybeSingle(),
      client.from('order_cancel_requests').select('id').eq('order_id', order.id).eq('status', 'pending').maybeSingle(),
    ]);
    const eligibility = canRequestChange({ fulfillmentStatus: order.fulfillment_status, paymentStatus: order.payment_status, hasPendingRequest: Boolean(pendingChange || pendingCancel) });
    if (eligibility !== 'ok') return { status: 'ineligible', reason: eligibility };
    const reason = input.reason?.trim() || null;

    if (!requiresReview({ fulfillmentStatus: order.fulfillment_status, paymentStatus: order.payment_status })) {
      const computed = applyChanges(order, order.items, parsed.diff);
      if (!computed.ok) return { status: 'invalid', error: computed.reason };
      const { data: inserted, error: insertError } = await client.from('order_change_requests').insert({ order_id: order.id, customer_id: input.customerId, changes: parsed.diff, status: 'applied', delta_minor: computed.deltaMinor, reason }).select('id').single();
      if (insertError || !inserted) return { status: 'failure' };
      const applied = await applyChangeToOrder(client, order, parsed.diff, input.customerId);
      if (!applied) return { status: 'failure' };
      if (order.customer_email) await deliver(client, { ...emailBase(order, deps.orderUrlBase ?? ''), type: 'change_approved' }, deps.deliver as never);
      return { status: 'applied', deltaMinor: computed.deltaMinor };
    }

    const { data: created, error: insertError } = await client.from('order_change_requests').insert({ order_id: order.id, customer_id: input.customerId, changes: parsed.diff, status: 'pending', reason }).select('id').single();
    if (insertError || !created) return { status: 'failure' };
    await client.from('order_events').insert({ order_id: order.id, actor_id: input.customerId, event_type: 'change_requested', from_status: null, to_status: null });
    return { status: 'created', requestId: String(created.id) };
  } catch {
    return { status: 'failure' };
  }
}

export type ReviewChangeResult =
  | { status: 'approved'; deltaMinor: number }
  | { status: 'applied'; deltaMinor: number }
  | { status: 'rejected' }
  | { status: 'not_found' }
  | { status: 'not_applicable' }
  | { status: 'refund_failed' }
  | { status: 'failure' };

export async function reviewChangeRequest(
  client: ChangeClient,
  input: { admin: AdminIdentity; requestId: string; action: 'approve' | 'reject'; reason?: string; orderUrlBase: string },
  deps: { deliver?: typeof deliverOrderNotification; refund?: typeof refundPaymobTransaction } = {},
): Promise<ReviewChangeResult> {
  const deliver = deps.deliver ?? deliverOrderNotification;
  const refund = deps.refund ?? refundPaymobTransaction;
  try {
    const { data } = await client.from('order_change_requests').select(`*,orders(${fullSelect})`).eq('id', input.requestId).maybeSingle();
    if (!data || !data.orders) return { status: 'not_found' };
    const request = data as { id: string; status: string; reason: string | null; changes: ChangeRequestDiff; orders: Record<string, any> };
    const order = normalizeOrder(request.orders);
    const now = new Date().toISOString();
    const base = emailBase(order, input.orderUrlBase);

    if (input.action === 'reject') {
      if (request.status !== 'pending' && request.status !== 'approved') return { status: 'not_applicable' };
      const { error } = await client.from('order_change_requests').update({ status: 'rejected', reason: input.reason?.trim() || null, reviewed_by: input.admin.userId, reviewed_at: now }).eq('id', input.requestId);
      if (error) return { status: 'failure' };
      await client.from('order_events').insert({ order_id: order.id, actor_id: input.admin.userId, event_type: 'change_rejected', from_status: null, to_status: null });
      await client.from('admin_audit_logs').insert({ actor_id: input.admin.userId, action: 'reject_change_request', target_type: 'order', target_id: order.id, metadata: { request_id: input.requestId } });
      if (order.customer_email) await deliver(client, { ...base, type: 'change_rejected' }, deps.deliver as never);
      return { status: 'rejected' };
    }

    if (request.status !== 'pending') return { status: 'not_applicable' };
    const parsed = parseChangeRequestDiff(request.changes);
    const computed = parsed.ok ? applyChanges(order, order.items, parsed.diff) : null;
    if (!parsed.ok || !computed || !computed.ok) return { status: 'not_applicable' };
    const delta = computed.deltaMinor;

    if (order.payment_status === 'paid' && delta > 0) {
      const { error } = await client.from('order_change_requests').update({ status: 'approved', delta_minor: delta, reason: input.reason?.trim() || null, reviewed_by: input.admin.userId, reviewed_at: now }).eq('id', input.requestId);
      if (error) return { status: 'failure' };
      await client.from('order_events').insert({ order_id: order.id, actor_id: input.admin.userId, event_type: 'change_approved', from_status: null, to_status: null, metadata: { delta_minor: delta, awaiting_payment: true } });
      await client.from('admin_audit_logs').insert({ actor_id: input.admin.userId, action: 'approve_change_request', target_type: 'order', target_id: order.id, metadata: { request_id: input.requestId, delta_minor: delta, awaiting_payment: true } });
      if (order.customer_email) await deliver(client, { ...base, type: 'change_payment_required' }, deps.deliver as never);
      return { status: 'approved', deltaMinor: delta };
    }

    if (order.payment_status === 'paid' && delta < 0) {
      const payment = (order.payments ?? []).find((row) => row.status === 'paid');
      if (!payment?.provider_reference) return { status: 'refund_failed' };
      const refundResult: PaymobRefundResult = await refund({ transactionId: payment.provider_reference, amountMinor: Math.abs(delta) });
      if (!refundResult.ok) return { status: 'refund_failed' };
      const { error: paymentError } = await client.from('payments').insert({ order_id: order.id, provider: 'paymob', provider_reference: refundResult.refundTransactionId, idempotency_key: `change-refund:${input.requestId}`, amount_minor: Math.abs(delta), currency: 'EGP', status: 'refunded', raw_event: { refund: { request_id: input.requestId, at: now } } });
      if (paymentError) return { status: 'failure' };
    }

    const applied = await applyChangeToOrder(client, order, parsed.diff, input.admin.userId);
    if (!applied) return { status: 'failure' };
    const { error: requestError } = await client.from('order_change_requests').update({ status: 'applied', delta_minor: delta, reason: input.reason?.trim() || null, reviewed_by: input.admin.userId, reviewed_at: now }).eq('id', input.requestId);
    if (requestError) return { status: 'failure' };
    await client.from('admin_audit_logs').insert({ actor_id: input.admin.userId, action: 'approve_change_request', target_type: 'order', target_id: order.id, metadata: { request_id: input.requestId, delta_minor: delta } });
    if (order.customer_email) await deliver(client, { ...base, type: 'change_approved' }, deps.deliver as never);
    return { status: 'applied', deltaMinor: delta };
  } catch {
    return { status: 'failure' };
  }
}

export async function handleChangePaymentCallback(
  client: ChangeClient,
  transaction: Record<string, any>,
  deps: { deliver?: typeof deliverOrderNotification; orderUrlBase?: string } = {},
): Promise<{ handled: boolean }> {
  const deliver = deps.deliver ?? deliverOrderNotification;
  const special = String(transaction.order?.special_reference ?? transaction.special_reference ?? '');
  if (!special.startsWith('change:')) return { handled: false };
  const requestId = special.slice('change:'.length);
  if (!requestId || transaction.success !== true) return { handled: true };
  try {
    const { data } = await client.from('order_change_requests').select(`*,orders(${fullSelect})`).eq('id', requestId).maybeSingle();
    if (!data || !data.orders) return { handled: true };
    const request = data as { id: string; status: string; changes: ChangeRequestDiff; orders: Record<string, any> };
    if (request.status !== 'approved') return { handled: true };
    const order = normalizeOrder(request.orders);
    const parsed = parseChangeRequestDiff(request.changes);
    const computed = parsed.ok ? applyChanges(order, order.items, parsed.diff) : null;
    if (!parsed.ok || !computed || !computed.ok) return { handled: true };
    const amountMinor = Number(transaction.amount_cents ?? 0);
    if (amountMinor !== computed.deltaMinor) return { handled: true };
    const providerReference = String(transaction.id ?? transaction.order?.id ?? '');
    const idempotencyKey = `change-pay:${providerReference}:success`;
    const { data: inserted, error: insertError } = await client.from('payments').insert({ order_id: order.id, provider: 'paymob', provider_reference: providerReference, idempotency_key: idempotencyKey, amount_minor: amountMinor, currency: String(transaction.currency ?? 'EGP'), status: 'paid', raw_event: transaction }).select('id').maybeSingle();
    if (insertError && !insertError.message.toLowerCase().includes('duplicate')) throw insertError;
    if (!inserted && insertError) return { handled: true };
    const applied = await applyChangeToOrder(client, order, parsed.diff, null);
    if (!applied) throw new Error('change apply failed after delta payment');
    const { error: requestError } = await client.from('order_change_requests').update({ status: 'applied', reviewed_at: new Date().toISOString() }).eq('id', request.id);
    if (requestError) throw requestError;
    if (order.customer_email) await deliver(client, { ...emailBase(order, deps.orderUrlBase ?? ''), type: 'change_approved' }, deps.deliver as never);
    return { handled: true };
  } catch {
    return { handled: true };
  }
}

type CreateDeltaIntention = (input: Omit<CreatePaymentInput, 'integrationId'>) => Promise<{ providerReference: string; checkoutUrl: string }>;

const defaultCreateIntention: CreateDeltaIntention = (input) => createPaymobIntention({ ...input, integrationId: Number(getRequiredServerEnv('PAYMOB_INTEGRATION_ID')) });

export type PayDeltaResult = { status: 'ok'; checkoutUrl: string } | { status: 'not_found' } | { status: 'not_payable' } | { status: 'failure' };

export async function payChangeRequestDelta(
  client: ChangeClient,
  input: { customerId: string; requestId: string },
  deps: { origin: string; createIntention?: CreateDeltaIntention },
): Promise<PayDeltaResult> {
  const create = deps.createIntention ?? defaultCreateIntention;
  try {
    const { data } = await client.from('order_change_requests').select(`id,status,delta_minor,orders(${orderSelect})`).eq('id', input.requestId).maybeSingle();
    if (!data || !data.orders) return { status: 'not_found' };
    const request = data as { id: string; status: string; delta_minor: number | null; orders: Record<string, any> };
    const order = normalizeOrder(request.orders);
    if (order.customer_id !== input.customerId) return { status: 'not_found' };
    if (request.status !== 'approved' || !request.delta_minor || request.delta_minor <= 0) return { status: 'not_payable' };
    const origin = deps.origin.replace(/\/$/, '');
    const result = await create({
      amountMinor: request.delta_minor,
      orderReference: `change:${request.id}`,
      customer: { name: order.recipient_name, email: order.customer_email ?? '', phone: order.recipient_phone },
      notificationUrl: `${origin}/api/webhooks/paymob`,
      redirectionUrl: `${origin}/orders/${order.id}?token=${encodeURIComponent(order.public_token ?? '')}`,
    });
    return { status: 'ok', checkoutUrl: result.checkoutUrl };
  } catch {
    return { status: 'failure' };
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/domain/change-request-service.test.ts`
Expected: PASS (24/24). Fix any mismatch between the test fakes and the service's chaining (the fake `select().eq().eq().maybeSingle()` chain and the review `select().eq().maybeSingle()` chain must match exactly).

- [ ] **Step 5: Create the three API routes**

`app/api/account/orders/[id]/change-request/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { submitChangeRequest } from '@/features/orders/change-request-service';
import { getCurrentCustomer } from '@/features/auth/customer';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getPublicOrigin } from '@/lib/origin';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const customer = await getCurrentCustomer();
  if (!customer) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  const { id } = await context.params;
  const body = (await request.json()) as { changes?: unknown; reason?: unknown };
  const result = await submitChangeRequest(getAdminSupabase(), { customerId: customer.id, orderId: id, changes: body.changes, reason: typeof body.reason === 'string' ? body.reason : undefined }, { orderUrlBase: getPublicOrigin(request) });
  if (result.status === 'not_found') return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  if (result.status === 'ineligible') return NextResponse.json({ error: result.reason }, { status: 409 });
  if (result.status === 'invalid') return NextResponse.json({ error: result.error }, { status: 400 });
  if (result.status === 'failure') return NextResponse.json({ error: 'Could not request the change' }, { status: 500 });
  if (result.status === 'created') return NextResponse.json({ ok: true, requestId: result.requestId }, { status: 201 });
  return NextResponse.json({ ok: true, applied: true, deltaMinor: result.deltaMinor }, { status: 200 });
}
```

`app/api/account/change-requests/[id]/pay/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { payChangeRequestDelta } from '@/features/orders/change-request-service';
import { getCurrentCustomer } from '@/features/auth/customer';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getPublicOrigin } from '@/lib/origin';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const customer = await getCurrentCustomer();
  if (!customer) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  const { id } = await context.params;
  const result = await payChangeRequestDelta(getAdminSupabase(), { customerId: customer.id, requestId: id }, { origin: getPublicOrigin(request) });
  if (result.status === 'not_found') return NextResponse.json({ error: 'Change request not found' }, { status: 404 });
  if (result.status === 'not_payable') return NextResponse.json({ error: 'This change request cannot be paid yet' }, { status: 409 });
  if (result.status === 'failure') return NextResponse.json({ error: 'Could not start the payment' }, { status: 503 });
  return NextResponse.json({ checkoutUrl: result.checkoutUrl }, { status: 200 });
}
```

`app/api/admin/change-requests/[id]/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { getCurrentAdmin } from '@/features/auth/server';
import { reviewChangeRequest } from '@/features/orders/change-request-service';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getPublicOrigin } from '@/lib/origin';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await context.params;
  const body = (await request.json()) as { action?: unknown; reason?: unknown };
  const action = body.action === 'approve' ? 'approve' : body.action === 'reject' ? 'reject' : null;
  if (!action) return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  const result = await reviewChangeRequest(getAdminSupabase(), { admin, requestId: id, action, reason: typeof body.reason === 'string' ? body.reason : undefined, orderUrlBase: getPublicOrigin(request) });
  if (result.status === 'not_found') return NextResponse.json({ error: 'Change request not found' }, { status: 404 });
  if (result.status === 'not_applicable') return NextResponse.json({ error: 'This change request can no longer be reviewed' }, { status: 409 });
  if (result.status === 'refund_failed') return NextResponse.json({ error: 'The refund failed — the request stays pending. Retry.' }, { status: 502 });
  if (result.status === 'failure') return NextResponse.json({ error: 'Could not review the change request' }, { status: 500 });
  if (result.status === 'rejected') return NextResponse.json({ ok: true, status: 'rejected' }, { status: 200 });
  return NextResponse.json({ ok: true, status: result.status, deltaMinor: result.deltaMinor }, { status: 200 });
}
```

- [ ] **Step 6: Verify with tsc, then commit**

Run: `npm run lint 2>&1 | tail -5`
Expected: clean (no output errors). Note: the `ChangeClient` type is `{ from: (table: string) => any }`, matching the `cancel-actions.ts` convention, so the chained fake calls typecheck.

```bash
git add features/orders/change-request-service.ts app/api/account/orders/[id]/change-request/route.ts app/api/account/change-requests/[id]/pay/route.ts app/api/admin/change-requests/[id]/route.ts tests/domain/change-request-service.test.ts
git commit -m "feat: change request service (submit/review/delta-pay/webhook) and API routes"
```

---

### Task 4: Notification types + webhook branch

**Files:**
- Modify: `features/notifications/email-types.ts:2`
- Modify: `features/notifications/email-templates.ts:8-10` (subjects maps)
- Modify: `features/notifications/notification-retry.ts:7-10` (NOTIFICATION_TYPES set)
- Modify: `app/api/webhooks/paymob/route.ts` (add the `change:` branch after the refund guard, around line 20)
- Test: `tests/domain/email-templates.test.ts` (extend)

**Interfaces:**
- Consumes: `handleChangePaymentCallback` (Task 3).
- Produces: three new `NotificationType` members consumed by Task 3's service calls (`change_approved`, `change_payment_required`, `change_rejected`) — TS will not compile until this task lands, which is expected at the boundary between Tasks 3 and 4.

- [ ] **Step 1: Extend the failing test**

Append to `tests/domain/email-templates.test.ts` (inside the existing describe block, next to the cancellation-subjects test at lines ~63-71):

```ts
  it('renders change-request subjects in all three locales', () => {
    expect(renderOrderEmail({ locale: 'en', type: 'change_approved', orderNumber: 'RO-1', totalMinor: 10000, orderUrl: 'https://example.com/o/1' }).subject).toBe('Your change request was approved');
    expect(renderOrderEmail({ locale: 'ar', type: 'change_approved', orderNumber: 'RO-1', totalMinor: 10000, orderUrl: 'https://example.com/o/1' }).subject).toBe('تمت الموافقة على طلب التعديل');
    expect(renderOrderEmail({ locale: 'fr', type: 'change_approved', orderNumber: 'RO-1', totalMinor: 10000, orderUrl: 'https://example.com/o/1' }).subject).toBe('Votre demande de modification a été approuvée');
    expect(renderOrderEmail({ locale: 'en', type: 'change_payment_required', orderNumber: 'RO-1', totalMinor: 10000, orderUrl: 'https://example.com/o/1' }).subject).toBe('Pay the difference for your order');
    expect(renderOrderEmail({ locale: 'en', type: 'change_rejected', orderNumber: 'RO-1', totalMinor: 10000, orderUrl: 'https://example.com/o/1' }).subject).toBe('Change request declined');
  });
```

And in the same test file, next to the existing `NOTIFICATION_TYPES` membership assertions (lines ~70-71):

```ts
    expect(NOTIFICATION_TYPES.has('change_approved')).toBe(true);
    expect(NOTIFICATION_TYPES.has('change_payment_required')).toBe(true);
    expect(NOTIFICATION_TYPES.has('change_rejected')).toBe(true);
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/domain/email-templates.test.ts`
Expected: FAIL — the new members are not part of `NotificationType` (compile error) or the subjects don't exist.

- [ ] **Step 3: Add the notification types**

`features/notifications/email-types.ts` — change the union to:

```ts
export type NotificationType = 'order_received' | 'payment_confirmed' | 'payment_failed' | 'preparing' | 'ready_for_delivery' | 'out_for_delivery' | 'delivered' | 'cancel_approved' | 'cancel_rejected' | 'change_approved' | 'change_payment_required' | 'change_rejected';
```

`features/notifications/email-templates.ts` — in the `subjects` const, add to each locale:

```ts
  en: { ..., change_approved: 'Your change request was approved', change_payment_required: 'Pay the difference for your order', change_rejected: 'Change request declined' },
  ar: { ..., change_approved: 'تمت الموافقة على طلب التعديل', change_payment_required: 'ادفع فرق السعر لطلبك', change_rejected: 'تم رفض طلب التعديل' },
  fr: { ..., change_approved: 'Votre demande de modification a été approuvée', change_payment_required: 'Payez la différence pour votre commande', change_rejected: 'Demande de modification refusée' },
```

`features/notifications/notification-retry.ts` — add the three members to the `NOTIFICATION_TYPES` set literal.

- [ ] **Step 4: Wire the webhook branch**

`app/api/webhooks/paymob/route.ts` — import the handler and add the branch **immediately after the refund-callback guard** (after the `is_refund` early return, before the `orderReference` extraction):

```ts
import { handleChangePaymentCallback } from '@/features/orders/change-request-service';
```

```ts
  // Change-request delta payments: Paymob echoes special_reference back in the
  // callback. Match it before the order path — the order path matches
  // display_number and would 400 on these (no merchant_order_id is set).
  const specialReference = String(transaction.order?.special_reference ?? transaction.special_reference ?? '');
  if (specialReference.startsWith('change:')) {
    await handleChangePaymentCallback(getAdminSupabase(), transaction, { orderUrlBase: getPublicOrigin(request) });
    return NextResponse.json({ received: true });
  }
```

- [ ] **Step 5: Run the tests and typecheck**

Run: `npx vitest run tests/domain/email-templates.test.ts tests/domain/change-request-service.test.ts && npm run lint 2>&1 | tail -5`
Expected: PASS for both files; lint clean (Task 3's service now compiles against the extended union).

- [ ] **Step 6: Commit**

```bash
git add features/notifications/email-types.ts features/notifications/email-templates.ts features/notifications/notification-retry.ts app/api/webhooks/paymob/route.ts tests/domain/email-templates.test.ts
git commit -m "feat: change-request notification types and paymob webhook branch"
```

---

### Task 5: i18n keys + account UI

**Files:**
- Modify: `features/i18n/dictionaries.ts` (append keys to all three locale objects — after `reviewActionFailed` in each)
- Modify: `features/account/account-repository.ts` (add `giftMessage` to item mapping + `getChangeRequestForOrder`)
- Create: `components/account/ChangeRequestForm.tsx`
- Create: `components/account/PayDifferenceButton.tsx`
- Modify: `app/[locale]/[city]/account/(dashboard)/orders/[id]/page.tsx` (status cards + form + pay button)
- Test: `tests/components/ChangeRequestForm.test.tsx`, `tests/components/PayDifferenceButton.test.tsx`

**Interfaces:**
- Consumes: `canRequestChange`, `requiresReview`'s result type via `ChangeEligibility` (Task 1); `getChangeRequestForOrder` (this task); existing i18n keys.
- Produces: `ChangeRequestForm` (props `{ orderId: string; items: Array<{ id: string; name: string; quantity: number; giftMessage: string }> }`), `PayDifferenceButton` (props `{ requestId: string }`), `CustomerChangeRequest` type + `getChangeRequestForOrder(client, userId, orderId)` in `account-repository.ts`.

- [ ] **Step 1: Write the failing component tests**

`tests/components/ChangeRequestForm.test.tsx`:

```tsx
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChangeRequestForm } from '@/components/account/ChangeRequestForm';
import { renderWithProviders } from '../test-utils';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const items = [
  { id: 'i1', name: 'Rose bouquet', quantity: 1, giftMessage: '' },
  { id: 'i2', name: 'Vase', quantity: 1, giftMessage: 'hi' },
];

describe('ChangeRequestForm', () => {
  it('posts only the changed fields and refreshes on success', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<ChangeRequestForm orderId="o1" items={items} />);
    fireEvent.change(screen.getByLabelText(/delivery date/i), { target: { value: '2026-08-20' } });
    fireEvent.click(screen.getByRole('button', { name: /request a change/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/account/orders/o1/change-request', expect.objectContaining({ method: 'POST' })));
    const [, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(JSON.parse(init.body)).toEqual({ changes: { delivery_date: '2026-08-20' } });
    expect(refresh).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('includes changed quantities and gift messages in the diff', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<ChangeRequestForm orderId="o1" items={items} />);
    fireEvent.change(screen.getByLabelText(/quantity.*rose bouquet/i), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText(/gift note.*vase/i), { target: { value: 'lots of love' } });
    fireEvent.click(screen.getByRole('button', { name: /request a change/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(JSON.parse(init.body)).toEqual({ changes: { items: [
      { id: 'i1', quantity: 3 },
      { id: 'i2', gift_message: 'lots of love' },
    ] } });
    vi.unstubAllGlobals();
  });

  it('shows an error when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    renderWithProviders(<ChangeRequestForm orderId="o1" items={items} />);
    fireEvent.click(screen.getByRole('button', { name: /request a change/i }));
    await waitFor(() => expect(screen.getByText(/could not request the change/i)).toBeInTheDocument());
    vi.unstubAllGlobals();
  });
});
```

`tests/components/PayDifferenceButton.test.tsx`:

```tsx
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PayDifferenceButton } from '@/components/account/PayDifferenceButton';
import { renderWithProviders } from '../test-utils';

describe('PayDifferenceButton', () => {
  it('opens the checkout URL from the pay route', async () => {
    const open = vi.fn();
    vi.stubGlobal('open', open);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ checkoutUrl: 'https://pay.example/checkout' }) }));
    renderWithProviders(<PayDifferenceButton requestId="req-1" />);
    fireEvent.click(screen.getByRole('button', { name: /pay the difference/i }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/account/change-requests/req-1/pay', expect.objectContaining({ method: 'POST' })));
    expect(open).toHaveBeenCalledWith('https://pay.example/checkout', '_blank');
    vi.unstubAllGlobals();
  });

  it('shows an error when the payment cannot start', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    renderWithProviders(<PayDifferenceButton requestId="req-1" />);
    fireEvent.click(screen.getByRole('button', { name: /pay the difference/i }));
    await waitFor(() => expect(screen.getByText(/could not start the payment/i)).toBeInTheDocument());
    vi.unstubAllGlobals();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/components/ChangeRequestForm.test.tsx tests/components/PayDifferenceButton.test.tsx`
Expected: FAIL with "Cannot find module '@/components/account/ChangeRequestForm'".

- [ ] **Step 3: Add the i18n keys**

Append to the `en` object in `features/i18n/dictionaries.ts` (right after `reviewActionFailed`):

```ts
changeRequests: 'Change requests', requestChange: 'Request a change', changeSubmitted: 'Change requested — we’ll review it shortly.', changeApplied: 'Change applied', changePending: 'Waiting for review', changeApproved: 'Change approved — awaiting payment', changeRejected: 'Change declined', changeAwaitingPayment: 'Awaiting payment', payDifference: 'Pay the difference', requestedChanges: 'Requested changes', noChangeRequests: 'No change requests.', noPendingChangeRequests: 'No change requests waiting for review.', couldNotRequestChange: 'Could not request the change.', couldNotReviewChange: 'Could not review the change request.', couldNotStartDeltaPayment: 'Could not start the payment.',
```

`ar`:

```ts
changeRequests: 'طلبات التعديل', requestChange: 'طلب تعديل', changeSubmitted: 'تم طلب التعديل — سنراجعه قريباً.', changeApplied: 'تم تطبيق التعديل', changePending: 'بانتظار المراجعة', changeApproved: 'تمت الموافقة — بانتظار الدفع', changeRejected: 'تم رفض التعديل', changeAwaitingPayment: 'بانتظار الدفع', payDifference: 'ادفع فرق السعر', requestedChanges: 'التعديلات المطلوبة', noChangeRequests: 'لا توجد طلبات تعديل.', noPendingChangeRequests: 'لا توجد طلبات تعديل بانتظار المراجعة.', couldNotRequestChange: 'تعذر طلب التعديل.', couldNotReviewChange: 'تعذرت مراجعة طلب التعديل.', couldNotStartDeltaPayment: 'تعذر بدء الدفع.',
```

`fr`:

```ts
changeRequests: 'Demandes de modification', requestChange: 'Demander une modification', changeSubmitted: 'Modification demandée — nous l’examinerons rapidement.', changeApplied: 'Modification appliquée', changePending: 'En attente de révision', changeApproved: 'Modification approuvée — en attente de paiement', changeRejected: 'Modification refusée', changeAwaitingPayment: 'En attente de paiement', payDifference: 'Payer la différence', requestedChanges: 'Modifications demandées', noChangeRequests: 'Aucune demande de modification.', noPendingChangeRequests: 'Aucune demande de modification en attente de révision.', couldNotRequestChange: 'Impossible de demander la modification.', couldNotReviewChange: 'Impossible de réviser la demande de modification.', couldNotStartDeltaPayment: 'Impossible de démarrer le paiement.',
```

Reuse existing keys for the form labels: `deliveryDate`, `deliveryWindow`, `recipientName`, `recipientPhone`, `address`, `giftNote`, `quantity`.

- [ ] **Step 4: Extend the account repository**

`features/account/account-repository.ts`:

- In `CustomerOrderDetail`, change the `items` element type to include `giftMessage: string`.
- In `getCustomerOrder`'s item mapping, add `giftMessage: String(item.gift_message ?? '')`.
- Add after `getCancelRequestForOrder`:

```ts
export type CustomerChangeRequest = { id: string; status: string; reason: string | null; deltaMinor: number | null; createdAt: string };

export async function getChangeRequestForOrder(client: AccountClient, userId: string, orderId: string): Promise<CustomerChangeRequest | null> {
  const { data } = await client.from('order_change_requests')
    .select('id,status,reason,delta_minor,created_at')
    .eq('order_id', orderId)
    .eq('customer_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return {
    id: String(data.id),
    status: String(data.status),
    reason: data.reason ? String(data.reason) : null,
    deltaMinor: data.delta_minor != null ? Number(data.delta_minor) : null,
    createdAt: String(data.created_at),
  };
}
```

- [ ] **Step 5: Implement the components**

`components/account/ChangeRequestForm.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useI18n } from '@/features/i18n/I18nProvider';

type ChangeItem = { id: string; name: string; quantity: number; giftMessage: string };

export function ChangeRequestForm({ orderId, items }: { orderId: string; items: ChangeItem[] }) {
  const router = useRouter();
  const { t } = useI18n();
  const [deliveryDate, setDeliveryDate] = useState('');
  const [deliveryWindow, setDeliveryWindow] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [address, setAddress] = useState('');
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [giftMessages, setGiftMessages] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    const changes: Record<string, unknown> = {};
    if (deliveryDate) changes.delivery_date = deliveryDate;
    if (deliveryWindow.trim()) changes.delivery_window = deliveryWindow.trim();
    if (recipientName.trim()) changes.recipient_name = recipientName.trim();
    if (recipientPhone.trim()) changes.recipient_phone = recipientPhone.trim();
    if (address.trim()) changes.delivery_address = address.trim();
    const itemChanges = items.flatMap((item) => {
      const entry: { id: string; quantity?: number; gift_message?: string } = { id: item.id };
      const rawQuantity = quantities[item.id];
      if (rawQuantity !== undefined && rawQuantity !== '') {
        const quantity = Number(rawQuantity);
        if (quantity !== item.quantity) entry.quantity = quantity;
      }
      const message = giftMessages[item.id];
      if (message !== undefined && message !== item.giftMessage) entry.gift_message = message;
      return Object.keys(entry).length > 1 ? [entry] : [];
    });
    if (itemChanges.length) changes.items = itemChanges;
    if (Object.keys(changes).length === 0) { setError(t('requestChange')); return; }
    setBusy(true);
    setError('');
    const response = await fetch(`/api/account/orders/${orderId}/change-request`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ changes }) });
    if (!response.ok) { setError(t('couldNotRequestChange')); setBusy(false); return; }
    router.refresh();
  }

  return (
    <div className="grid gap-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="grid gap-1 text-sm"><span>{t('deliveryDate')}</span><Input type="date" value={deliveryDate} onChange={(event) => setDeliveryDate(event.target.value)} /></label>
        <label className="grid gap-1 text-sm"><span>{t('deliveryWindow')}</span><Input value={deliveryWindow} onChange={(event) => setDeliveryWindow(event.target.value)} placeholder="17:00-19:00" /></label>
        <label className="grid gap-1 text-sm"><span>{t('recipientName')}</span><Input value={recipientName} onChange={(event) => setRecipientName(event.target.value)} /></label>
        <label className="grid gap-1 text-sm"><span>{t('recipientPhone')}</span><Input value={recipientPhone} onChange={(event) => setRecipientPhone(event.target.value)} /></label>
        <label className="grid gap-1 text-sm sm:col-span-2"><span>{t('address')}</span><Input value={address} onChange={(event) => setAddress(event.target.value)} /></label>
      </div>
      {items.map((item) => (
        <div key={item.id} className="grid gap-2 rounded border p-3">
          <p className="text-sm font-medium">{item.name}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="grid gap-1 text-sm"><span>{t('quantity')}</span><Input type="number" min={1} aria-label={`${t('quantity')} ${item.name}`} defaultValue={item.quantity} onChange={(event) => setQuantities((previous) => ({ ...previous, [item.id]: event.target.value }))} /></label>
            <label className="grid gap-1 text-sm"><span>{t('giftNote')}</span><Textarea rows={2} aria-label={`${t('giftNote')} ${item.name}`} defaultValue={item.giftMessage} onChange={(event) => setGiftMessages((previous) => ({ ...previous, [item.id]: event.target.value }))} /></label>
          </div>
        </div>
      ))}
      <div className="flex items-center gap-3">
        <Button variant="outline" onClick={submit} disabled={busy}>{t('requestChange')}</Button>
        {error ? <small className="text-sm text-destructive">{error}</small> : null}
      </div>
    </div>
  );
}
```

`components/account/PayDifferenceButton.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/features/i18n/I18nProvider';

export function PayDifferenceButton({ requestId }: { requestId: string }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function pay() {
    setBusy(true);
    setError('');
    const response = await fetch(`/api/account/change-requests/${requestId}/pay`, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
    if (!response.ok) { setError(t('couldNotStartDeltaPayment')); setBusy(false); return; }
    const body = (await response.json()) as { checkoutUrl?: string };
    if (body.checkoutUrl) window.open(body.checkoutUrl, '_blank');
    setBusy(false);
  }

  return <span className="flex items-center gap-3"><Button size="sm" onClick={pay} disabled={busy}>{t('payDifference')}</Button>{error ? <small className="text-sm text-destructive">{error}</small> : null}</span>;
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/components/ChangeRequestForm.test.tsx tests/components/PayDifferenceButton.test.tsx tests/domain/i18n-dictionary.test.ts`
Expected: PASS (5 + parity). If a test's `getByLabelText` query fails, adjust the `aria-label`/`<label>` wiring in the component to match (labels must wrap or reference the input).

- [ ] **Step 7: Wire the account order page**

`app/[locale]/[city]/account/(dashboard)/orders/[id]/page.tsx`:

- Imports: add `getChangeRequestForOrder` to the account-repository import; add `ChangeRequestForm`, `PayDifferenceButton`; add `canRequestChange` (already imports `canRequestCancellation` from `@/features/orders/cancel-request` — import `canRequestChange` from `@/features/orders/change-request`).
- After `const cancelRequest = ...`, add:

```ts
  const changeRequest = supabase ? await getChangeRequestForOrder(supabase, customer.id, order.id) : null;
  const changeEligibility = canRequestChange({ fulfillmentStatus: order.fulfillmentStatus, paymentStatus: order.paymentStatus, hasPendingRequest: changeRequest?.status === 'pending' || cancelRequest?.status === 'pending' });
```

- After the cancel-request card block (the `: null}` at the end of the conditional chain), add the change-request block:

```tsx
      {changeRequest?.status === 'pending' ? <Card><CardHeader><CardTitle>{t('changePending')}</CardTitle></CardHeader><CardContent>{changeRequest.reason ? <p className="text-sm text-muted-foreground">{t('cancellationReason')}: {changeRequest.reason}</p> : null}</CardContent></Card>
        : changeRequest?.status === 'approved' ? <Card><CardHeader><CardTitle>{t('changeApproved')}</CardTitle></CardHeader><CardContent className="grid gap-2">{changeRequest.reason ? <p className="text-sm text-muted-foreground">{t('cancellationReason')}: {changeRequest.reason}</p> : null}<PayDifferenceButton requestId={changeRequest.id} /></CardContent></Card>
        : changeRequest?.status === 'applied' ? <Card><CardHeader><CardTitle>{t('changeApplied')}</CardTitle></CardHeader><CardContent>{changeRequest.reason ? <p className="text-sm text-muted-foreground">{t('cancellationReason')}: {changeRequest.reason}</p> : null}</CardContent></Card>
        : changeRequest?.status === 'rejected' ? <Card><CardHeader><CardTitle>{t('changeRejected')}</CardTitle></CardHeader><CardContent>{changeRequest.reason ? <p className="text-sm text-muted-foreground">{t('cancellationReason')}: {changeRequest.reason}</p> : null}</CardContent></Card>
        : changeEligibility === 'ok' ? <Card><CardHeader><CardTitle>{t('requestChange')}</CardTitle></CardHeader><CardContent><ChangeRequestForm orderId={order.id} items={order.items.map((item) => ({ id: item.id, name: item.nameEn, quantity: item.quantity, giftMessage: item.giftMessage }))} /></CardContent></Card>
        : null}
```

- [ ] **Step 8: Verify and commit**

Run: `npx vitest run tests/components/ChangeRequestForm.test.tsx tests/components/PayDifferenceButton.test.tsx tests/domain/i18n-dictionary.test.ts && npm run lint 2>&1 | tail -5`
Expected: PASS; lint clean.

```bash
git add features/i18n/dictionaries.ts features/account/account-repository.ts components/account/ChangeRequestForm.tsx components/account/PayDifferenceButton.tsx "app/[locale]/[city]/account/(dashboard)/orders/[id]/page.tsx" tests/components/ChangeRequestForm.test.tsx tests/components/PayDifferenceButton.test.tsx
git commit -m "feat: account change-request form, status cards, and delta payment button"
```

---

### Task 6: Admin queue + sidebar

**Files:**
- Create: `components/admin/ChangeRequestReview.tsx`
- Create: `app/admin/change-requests/page.tsx`
- Modify: `components/admin/AdminShell.tsx` (NAV_ITEMS)
- Test: `tests/components/ChangeRequestReview.test.tsx`

**Interfaces:**
- Consumes: `parseChangeRequestDiff`, `applyChanges` (Tasks 1–2) for the delta preview; `AutoRefresh`; `getCurrentAdmin`, `getAdminSupabase`, `getServerT`, `formatMoney`, status labels; `ChangeRequestReview` (this task).

- [ ] **Step 1: Write the failing component test**

`tests/components/ChangeRequestReview.test.tsx`:

```tsx
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChangeRequestReview } from '@/components/admin/ChangeRequestReview';
import { renderWithProviders } from '../test-utils';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

describe('ChangeRequestReview', () => {
  it('posts approve and refreshes', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<ChangeRequestReview requestId="req-1" />);
    fireEvent.click(screen.getByRole('button', { name: /approve/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/admin/change-requests/req-1', expect.objectContaining({ method: 'POST' })));
    const [, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(JSON.parse(init.body)).toEqual({ action: 'approve', reason: undefined });
    expect(refresh).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('posts reject with the typed reason and refreshes', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<ChangeRequestReview requestId="req-1" />);
    fireEvent.change(screen.getByPlaceholderText(/reason for rejection/i), { target: { value: 'too late' } });
    fireEvent.click(screen.getByRole('button', { name: /reject/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(JSON.parse(init.body)).toEqual({ action: 'reject', reason: 'too late' });
    expect(refresh).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('shows an error and does not refresh when the review fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    renderWithProviders(<ChangeRequestReview requestId="req-1" />);
    fireEvent.click(screen.getByRole('button', { name: /approve/i }));
    await waitFor(() => expect(screen.getByText(/could not review the change request/i)).toBeInTheDocument());
    expect(refresh).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/components/ChangeRequestReview.test.tsx`
Expected: FAIL with "Cannot find module '@/components/admin/ChangeRequestReview'".

- [ ] **Step 3: Implement the review control**

`components/admin/ChangeRequestReview.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/features/i18n/I18nProvider';

export function ChangeRequestReview({ requestId }: { requestId: string }) {
  const router = useRouter();
  const { t } = useI18n();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function review(action: 'approve' | 'reject') {
    setBusy(true);
    setError('');
    const response = await fetch(`/api/admin/change-requests/${requestId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, reason: action === 'reject' && reason.trim() ? reason.trim() : undefined }) });
    if (!response.ok) { setError(t('couldNotReviewChange')); setBusy(false); return; }
    router.refresh();
  }

  return <div className="grid gap-2"><Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder={t('rejectionReason')} /><span className="flex items-center gap-2"><Button size="sm" onClick={() => review('approve')} disabled={busy}>{t('approveCancellation')}</Button><Button size="sm" variant="outline" onClick={() => review('reject')} disabled={busy}>{t('rejectCancellation')}</Button>{error ? <small className="text-sm text-destructive">{error}</small> : null}</span></div>;
}
```

(Reuses the existing `approveCancellation`/`rejectCancellation`/`rejectionReason` keys — same labels as the cancel queue.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/components/ChangeRequestReview.test.tsx`
Expected: PASS (3/3).

- [ ] **Step 5: Create the queue page**

`app/admin/change-requests/page.tsx`:

```tsx
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { StatusMessage } from '@/components/ui/status-message';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AdminShell } from '@/components/admin/AdminShell';
import { AutoRefresh } from '@/components/admin/AutoRefresh';
import { ChangeRequestReview } from '@/components/admin/ChangeRequestReview';
import { getCurrentAdmin } from '@/features/auth/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getServerT } from '@/features/i18n/server';
import { formatMoney } from '@/features/money';
import { fulfillmentBadgeVariant, fulfillmentLabel, paymentBadgeVariant, paymentLabel } from '@/features/admin/status-labels';
import { parseChangeRequestDiff, applyChanges, type ChangeRequestDiff } from '@/features/orders/change-request';

type ChangeRequestRow = {
  id: string;
  status: 'pending' | 'approved' | 'applied' | 'rejected';
  reason: string | null;
  deltaMinor: number | null;
  createdAt: string;
  reviewedAt: string | null;
  reviewedByName: string | null;
  summary: string[];
  deltaLabel: string;
  awaitingPayment: boolean;
  order: { id: string; display_number: string; customer_email: string; payment_status: string; fulfillment_status: string } | null;
};

const FIELD_LABELS: Array<[keyof ChangeRequestDiff, string]> = [
  ['delivery_date', 'deliveryDate'],
  ['delivery_window', 'deliveryWindow'],
  ['recipient_name', 'recipientName'],
  ['recipient_phone', 'recipientPhone'],
  ['delivery_address', 'address'],
];

function buildSummary(diff: ChangeRequestDiff, order: Record<string, any>, t: (key: string) => string): string[] {
  const lines: string[] = [];
  for (const [key, labelKey] of FIELD_LABELS) {
    const value = diff[key];
    if (value !== undefined) lines.push(`${t(labelKey)} → ${String(value)}`);
  }
  for (const change of diff.items ?? []) {
    const item = (order.order_items ?? []).find((row: any) => String(row.id) === String(change.id));
    const name = item ? String(item.product_name_en ?? '') : change.id;
    if (change.quantity !== undefined) lines.push(`${t('quantity')} ${name}: ${Number(item?.quantity ?? '?')} → ${change.quantity}`);
    if (change.gift_message !== undefined) lines.push(`${t('giftNote')} ${name}`);
  }
  return lines;
}

function formatDate(value: string, locale: string) {
  return new Date(value).toLocaleString(locale === 'ar' ? 'ar-EG' : locale === 'fr' ? 'fr-FR' : 'en-GB');
}

export default async function AdminChangeRequestsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const admin = await getCurrentAdmin();
  if (!admin) redirect('/login');
  const { t, locale } = await getServerT();
  const params = await searchParams;
  const showResolved = params.status === 'resolved';

  const supabase = getAdminSupabase();
  const orderSelect = 'id,display_number,customer_email,payment_status,fulfillment_status,total_minor,subtotal_minor,delivery_fee_minor,discount_minor';
  const [{ data: activeRows }, { data: resolvedRows }] = await Promise.all([
    supabase.from('order_change_requests').select(`id,status,reason,changes,delta_minor,created_at,reviewed_at,reviewed_by,orders(${orderSelect},order_items(id,unit_price_minor,quantity,gift_message,product_name_en))`).in('status', ['pending', 'approved']).order('created_at', { ascending: false }).limit(100),
    supabase.from('order_change_requests').select(`id,status,reason,changes,delta_minor,created_at,reviewed_at,reviewed_by,orders(${orderSelect})`).in('status', ['applied', 'rejected']).order('reviewed_at', { ascending: false }).limit(100),
  ]);

  const reviewerIds = [...new Set([...(activeRows ?? []), ...(resolvedRows ?? [])].map((row) => row?.reviewed_by).filter((value): value is string => Boolean(value)))];
  const { data: reviewerRows } = reviewerIds.length ? await supabase.from('profiles').select('id,display_name').in('id', reviewerIds) : { data: [] };
  const reviewerNames = new Map((reviewerRows ?? []).map((profile) => [String(profile.id), String(profile.display_name ?? profile.id)]));

  const mapRow = (row: Record<string, any>): ChangeRequestRow => {
    const order = row.orders as Record<string, any> | null;
    const parsed = parseChangeRequestDiff(row.changes);
    let deltaLabel = '—';
    let summary: string[] = [];
    if (parsed.ok && order) {
      summary = buildSummary(parsed.diff, order, t);
      const computed = applyChanges(order, (order.order_items ?? []).map((item: any) => ({ id: String(item.id), unit_price_minor: Number(item.unit_price_minor), quantity: Number(item.quantity), gift_message: String(item.gift_message ?? '') })), parsed.diff);
      if (computed.ok) {
        const sign = computed.deltaMinor > 0 ? '+' : computed.deltaMinor < 0 ? '−' : '';
        deltaLabel = `${formatMoney(order.total_minor, locale)} → ${formatMoney(computed.totalMinor, locale)}${sign ? ` · ${sign}${formatMoney(Math.abs(computed.deltaMinor), locale)}` : ''}`;
      }
    }
    return {
      id: String(row.id),
      status: row.status as ChangeRequestRow['status'],
      reason: row.reason ? String(row.reason) : null,
      deltaMinor: row.delta_minor != null ? Number(row.delta_minor) : null,
      createdAt: String(row.created_at),
      reviewedAt: row.reviewed_at ? String(row.reviewed_at) : null,
      reviewedByName: row.reviewed_by ? reviewerNames.get(String(row.reviewed_by)) ?? null : null,
      summary,
      deltaLabel,
      awaitingPayment: row.status === 'approved',
      order: order ? { id: String(order.id), display_number: String(order.display_number), customer_email: String(order.customer_email ?? ''), payment_status: String(order.payment_status ?? ''), fulfillment_status: String(order.fulfillment_status ?? '') } : null,
    };
  };

  const active = (activeRows ?? []).map(mapRow);
  const resolved = (resolvedRows ?? []).map(mapRow);
  const rows = showResolved ? resolved : active;

  const tabLink = 'text-sm font-bold underline-offset-4 hover:underline';
  const tabActive = 'text-primary underline';
  const tabIdle = 'text-muted-foreground';

  return <AdminShell>
    <AutoRefresh />
    <p className="text-xs font-bold uppercase tracking-[.16em] text-sage">{t('customerOrders')}</p>
    <h1 className="font-display text-[clamp(2rem,4vw,3rem)] leading-tight tracking-[-.02em]">{t('changeRequests')}</h1>

    <nav className="mt-4 flex items-center gap-6 border-b pb-2">
      <Link className={`${tabLink} ${showResolved ? tabIdle : tabActive}`} href="/admin/change-requests">{t('pendingRequests', { count: active.length })}</Link>
      <Link className={`${tabLink} ${showResolved ? tabActive : tabIdle}`} href="/admin/change-requests?status=resolved">{t('resolvedRequests', { count: resolved.length })}</Link>
    </nav>

    {rows.length === 0 ? <StatusMessage title={showResolved ? t('noChangeRequests') : t('noPendingChangeRequests')} /> : <Card className="mt-4"><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>{t('orders')}</TableHead><TableHead>{t('cancellationRequestedBy')}</TableHead><TableHead>{t('requestedChanges')}</TableHead><TableHead>{t('changeDelta')}</TableHead>{showResolved ? <><TableHead>{t('decision')}</TableHead><TableHead>{t('reviewedBy')}</TableHead></> : <><TableHead>{t('payment')}</TableHead><TableHead>{t('fulfillment')}</TableHead><TableHead className="text-end">{t('review')}</TableHead></>}</TableRow></TableHeader><TableBody>{rows.map((request) => (
      <TableRow key={request.id}>
        <TableCell><Link className="font-medium text-primary underline-offset-4 hover:underline" href={`/admin/orders/${request.order?.id ?? ''}`}>{request.order?.display_number ?? '—'}</Link><span className="block text-sm text-muted-foreground">{formatDate(request.createdAt, locale)}</span></TableCell>
        <TableCell>{request.order?.customer_email ?? '—'}</TableCell>
        <TableCell><ul className="grid list-none gap-0 p-0 text-sm">{request.summary.map((line) => <li key={line}>{line}</li>)}</ul>{request.awaitingPayment ? <Badge variant="default">{t('changeAwaitingPayment')}</Badge> : null}</TableCell>
        <TableCell>{request.deltaLabel}</TableCell>
        {showResolved ? (
          <>
            <TableCell><Badge variant={request.status === 'applied' ? 'success' : 'default'}>{request.status === 'applied' ? t('changeApplied') : t('changeRejected')}</Badge><span className="block text-sm text-muted-foreground">{request.reviewedAt ? formatDate(request.reviewedAt, locale) : '—'}</span></TableCell>
            <TableCell>{request.reviewedByName ?? '—'}</TableCell>
          </>
        ) : (
          <>
            <TableCell><Badge variant={paymentBadgeVariant(request.order?.payment_status ?? '')}>{paymentLabel(request.order?.payment_status ?? 'pending', t)}</Badge></TableCell>
            <TableCell><Badge variant={fulfillmentBadgeVariant(request.order?.fulfillment_status ?? '')}>{fulfillmentLabel(request.order?.fulfillment_status ?? 'confirmed', t)}</Badge></TableCell>
            <TableCell className="text-end"><ChangeRequestReview requestId={request.id} /></TableCell>
          </>
        )}
      </TableRow>
    ))}</TableBody></Table></div></Card>}
  </AdminShell>;
}
```

- [ ] **Step 6: Add the `changeDelta` i18n key**

The page references `t('changeDelta')` — add it to all three locale objects in `features/i18n/dictionaries.ts` next to the other change keys from Task 5:

```ts
changeDelta: 'Delta', // en
changeDelta: 'الفرق', // ar
changeDelta: 'Écart', // fr
```

- [ ] **Step 7: Add the sidebar entry**

`components/admin/AdminShell.tsx` — insert into `NAV_ITEMS` after the cancel-requests entry:

```ts
  { href: '/admin/change-requests', key: 'changeRequests' },
```

- [ ] **Step 8: Verify and commit**

Run: `npx vitest run tests/components/ChangeRequestReview.test.tsx tests/domain/i18n-dictionary.test.ts && npm run lint 2>&1 | tail -5`
Expected: PASS; lint clean. In `mapRow`, `order` is narrowed to `Record<string, any>` so it satisfies `applyChanges`'s order parameter directly; if tsc ever rejects it, pass an explicit `{ subtotal_minor: Number(order.subtotal_minor), delivery_fee_minor: Number(order.delivery_fee_minor), discount_minor: order.discount_minor != null ? Number(order.discount_minor) : null, total_minor: Number(order.total_minor) }` object instead.

```bash
git add components/admin/ChangeRequestReview.tsx app/admin/change-requests/page.tsx components/admin/AdminShell.tsx features/i18n/dictionaries.ts tests/components/ChangeRequestReview.test.tsx
git commit -m "feat: admin change-request queue with delta preview and quick actions"
```

---

### Task 7: Full gate + final review + branch finish

**Files:** none (verification + wrap-up)

- [ ] **Step 1: Run the full test suite**

Run: `npm test 2>&1 | tail -6`
Expected: all files pass (~85 files; the exact count depends on files added in Tasks 1–6). Investigate and fix any failures before proceeding.

- [ ] **Step 2: Typecheck and build**

Run: `npm run lint 2>&1 | tail -5 && npm run build 2>&1 | grep -E "change-request|change-requests|✓ Compiled|Failed" | head -10`
Expected: lint clean; build exit 0 with `/admin/change-requests` and the three new API routes compiled.

- [ ] **Step 3: Whole-branch review**

Run: `git status --short && git log --oneline -8`
- Confirm every changed file is intentional and no stray files (e.g. `next-env.d.ts`, package-lock churn) are staged.
- Re-read the spec (`docs/superpowers/specs/2026-08-18-order-change-requests-design.md`) against the diff: migration matches the spec table/RLS/status machine; the money table (delta > 0 / < 0 / = 0, paid vs unpaid) matches; the webhook branch matches; the account + admin UIs match.
- If `git checkout -- next-env.d.ts` is needed to drop build artifacts, do that before committing.

- [ ] **Step 4: Update the SDD ledger and finish the branch**

Update `.superpowers/sdd/2026-08-18-order-change-requests/progress.md` with: completed tasks, any rulings made during execution (deviations from this plan + their cost if wrong), and deferred minors. Then ask the user whether to merge `feature/order-change-requests` into `master` and push (re-verifying the merged tree before pushing, as with prior features).
