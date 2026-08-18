# Customer Order Cancellation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a signed-in customer request cancellation of one of their orders — instant when nothing is committed, admin review otherwise — with emails and full i18n.

**Architecture:** A new `order_cancel_requests` table (RLS: customers read/create own requests; reviews via service role) plus pure eligibility/tier logic in `features/orders/cancel-request.ts`. Two thin service functions in `features/orders/cancel-actions.ts` (client-passed, fake-testable) drive the mutations: `requestCancellation` (customer) and `reviewCancellationRequest` (admin). Two API routes, UI on the account and admin order detail pages, and two new email types reuse the existing `deliverOrderNotification` pipeline.

**Tech Stack:** Next.js App Router, Supabase (Postgres + RLS), vitest, shadcn/ui components, existing `features/notifications/*` and `features/commerce/order-state.ts` machinery.

**Spec:** `docs/superpowers/specs/2026-08-18-customer-order-cancellation-design.md`

## Global Constraints

- No new dependencies. Follow existing codebase patterns (client-passed repositories/services, `respond`/`logRouteError` from `@/lib/api` for new routes, i18n dictionaries in one flat line per locale).
- Every new i18n key must exist in EN, AR, and FR (`ar`/`fr` objects must ⊇ `en` — the i18n dictionary test enforces this).
- `order_events.event_type` is free-form (no check constraint) — new event types need no schema change.
- Customers have **no UPDATE RLS policy on `orders`** — all cancellation mutations run through the service-role admin client; ownership is enforced in the service by selecting the order with `eq('customer_id', ...)`.
- Refunds are store-side status only (`payment_status = 'refunded'`); no Paymob refund API call.
- Verification gate per task: `npx vitest run <file>` (focused), then at the end `npm test`, `npm run lint`, `npm run build`.
- Current baseline: 333 tests. New totals are approximate.

---

### Task 1: Migration `009` + pure eligibility/tier logic

**Files:**
- Create: `supabase/migrations/009_order_cancel_requests.sql`
- Create: `features/orders/cancel-request.ts`
- Test: `tests/domain/cancel-request.test.ts`

**Interfaces:**
- Produces: `CancelEligibility` union and functions consumed by Tasks 2–5.

```ts
export type CancelEligibility = 'ok' | 'not_found' | 'already_cancelled' | 'delivered' | 'refunded' | 'request_pending';
export function canRequestCancellation(order: { fulfillmentStatus: string; paymentStatus: string; hasPendingRequest: boolean } | null): CancelEligibility;
export function requiresReview(order: { fulfillmentStatus: string; paymentStatus: string }): boolean;
```

- [ ] **Step 1: Write the failing test**

Create `tests/domain/cancel-request.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { canRequestCancellation, requiresReview } from '@/features/orders/cancel-request';

describe('canRequestCancellation', () => {
  const active = { fulfillmentStatus: 'confirmed', paymentStatus: 'pending', hasPendingRequest: false };

  it('is ok for an active, unpaid order without a pending request', () => {
    expect(canRequestCancellation(active)).toBe('ok');
  });

  it('reports not_found for a missing order', () => {
    expect(canRequestCancellation(null)).toBe('not_found');
  });

  it('reports already_cancelled, delivered, refunded, and request_pending', () => {
    expect(canRequestCancellation({ ...active, fulfillmentStatus: 'cancelled' })).toBe('already_cancelled');
    expect(canRequestCancellation({ ...active, fulfillmentStatus: 'delivered' })).toBe('delivered');
    expect(canRequestCancellation({ ...active, paymentStatus: 'refunded' })).toBe('refunded');
    expect(canRequestCancellation({ ...active, hasPendingRequest: true })).toBe('request_pending');
  });
});

describe('requiresReview', () => {
  it('is false only when confirmed and not paid', () => {
    expect(requiresReview({ fulfillmentStatus: 'confirmed', paymentStatus: 'pending' })).toBe(false);
    expect(requiresReview({ fulfillmentStatus: 'confirmed', paymentStatus: 'payment_failed' })).toBe(false);
  });

  it('is true when payment is captured or fulfillment has started', () => {
    expect(requiresReview({ fulfillmentStatus: 'confirmed', paymentStatus: 'paid' })).toBe(true);
    expect(requiresReview({ fulfillmentStatus: 'preparing', paymentStatus: 'pending' })).toBe(true);
    expect(requiresReview({ fulfillmentStatus: 'out_for_delivery', paymentStatus: 'paid' })).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/domain/cancel-request.test.ts`
Expected: FAIL — `Failed to resolve import "@/features/orders/cancel-request"`.

- [ ] **Step 3: Write the implementation**

Create `features/orders/cancel-request.ts`:

```ts
export type CancelEligibility = 'ok' | 'not_found' | 'already_cancelled' | 'delivered' | 'refunded' | 'request_pending';

export function canRequestCancellation(order: { fulfillmentStatus: string; paymentStatus: string; hasPendingRequest: boolean } | null): CancelEligibility {
  if (!order) return 'not_found';
  if (order.hasPendingRequest) return 'request_pending';
  if (order.fulfillmentStatus === 'cancelled') return 'already_cancelled';
  if (order.fulfillmentStatus === 'delivered') return 'delivered';
  if (order.paymentStatus === 'refunded') return 'refunded';
  return 'ok';
}

export function requiresReview(order: { fulfillmentStatus: string; paymentStatus: string }): boolean {
  return order.paymentStatus === 'paid' || order.fulfillmentStatus !== 'confirmed';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/domain/cancel-request.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Write the migration**

Create `supabase/migrations/009_order_cancel_requests.sql` (idempotent, mirrors existing migration style):

```sql
-- Customer cancellation requests. Customers read/create their own;
-- approve/reject runs through the service-role client only.
create table if not exists public.order_cancel_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  customer_id uuid not null references public.profiles(id),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reason text,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists order_cancel_requests_order_idx on public.order_cancel_requests(order_id);
create index if not exists order_cancel_requests_status_idx on public.order_cancel_requests(status);

alter table public.order_cancel_requests enable row level security;

create policy "customers read own cancel requests" on public.order_cancel_requests
  for select using (customer_id = auth.uid());

create policy "customers create cancel requests for own orders" on public.order_cancel_requests
  for insert with check (
    customer_id = auth.uid()
    and exists (select 1 from public.orders o where o.id = order_id and o.customer_id = auth.uid())
  );
```

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/009_order_cancel_requests.sql features/orders/cancel-request.ts tests/domain/cancel-request.test.ts
git commit -m "feat: add cancellation eligibility logic and order_cancel_requests migration"
```

---

### Task 2: Customer cancel-request service + API route + account repository read

**Files:**
- Create: `features/orders/cancel-actions.ts` (adds `requestCancellation`)
- Create: `app/api/account/orders/[id]/cancel-request/route.ts`
- Modify: `features/account/account-repository.ts` (add `getCancelRequestForOrder`)
- Test: `tests/domain/cancel-actions.test.ts` (new, this task covers `requestCancellation`)
- Test: `tests/domain/account-repository.test.ts` (extend)

**Interfaces:**
- Consumes: `canRequestCancellation`, `requiresReview` from Task 1; `deliverOrderNotification` from `@/features/notifications/notification-delivery`; `getCurrentCustomer` from `@/features/auth/customer`; `getAdminSupabase` from `@/lib/supabase/admin`; `getPublicOrigin` from `@/lib/origin`.
- Produces: `RequestCancellationResult` (consumed by the route + Task 5 UI) and `getCancelRequestForOrder` (consumed by Task 5).

```ts
type CancelClient = { from: (table: string) => any };

export type RequestCancellationResult =
  | { status: 'auto_cancelled' }
  | { status: 'created'; requestId: string }
  | { status: 'ineligible'; reason: Exclude<CancelEligibility, 'ok'> }
  | { status: 'not_found' }
  | { status: 'failure' };

export async function requestCancellation(
  client: CancelClient,
  input: { customerId: string; orderId: string; reason?: string },
  deps: { deliver?: typeof deliverOrderNotification; orderUrlBase?: string } = {},
): Promise<RequestCancellationResult>;
```

- [ ] **Step 1: Write the failing test**

Create `tests/domain/cancel-actions.test.ts` with a fake client. The fake must support: `orders` select with `eq` chain + `maybeSingle`, `order_cancel_requests` select/insert, `order_events` insert, `notification_deliveries` insert + update, `admin_audit_logs` insert (used by Task 3; build it once).

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requestCancellation } from '@/features/orders/cancel-actions';

type Call = { table: string; op: string; payload?: unknown; eq?: Array<[string, unknown]> };

const orderRow = {
  id: 'o1', display_number: 'RO-1', fulfillment_status: 'confirmed', payment_status: 'pending',
  customer_id: 'c1', customer_email: 'buyer@example.com', locale: 'en',
  total_minor: 10000, subtotal_minor: 10000, delivery_fee_minor: 0, discount_minor: null, public_token: 'tok',
};

function fakeClient(options: { order?: unknown; pendingRequest?: unknown } = {}) {
  const calls: Call[] = [];
  const record = (table: string, op: string, payload?: unknown) => calls.push({ table, op, payload });
  // Both lookups in the service are two-eq chains ending in maybeSingle:
  //   orders:            select(...).eq('id').eq('customer_id').maybeSingle()
  //   order_cancel_requests: select('id').eq('order_id').eq('status').maybeSingle()
  const client = {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: table === 'orders' ? (options.order ?? null) : (options.pendingRequest ?? null), error: null }),
          }),
        }),
      }),
      insert: (payload: unknown) => ({ select: () => ({ single: async () => { record(table, 'insert', payload); return { data: { id: 'req-1' }, error: null }; } }) }),
      update: (payload: unknown) => ({ eq: (_col: string, id: string) => { record(table, 'update', payload); return { error: null }; } }),
    }),
  };
  return { client, calls };
}

const deliver = vi.fn().mockResolvedValue({ accepted: true });

beforeEach(() => deliver.mockClear());

describe('requestCancellation', () => {
  it('returns not_found when the order does not belong to the customer', async () => {
    const { client } = fakeClient({ order: null });
    const result = await requestCancellation(client, { customerId: 'c1', orderId: 'o1' }, { deliver });
    expect(result).toEqual({ status: 'not_found' });
  });

  it('returns ineligible with the reason for a cancelled order', async () => {
    const { client } = fakeClient({ order: { ...orderRow, fulfillment_status: 'cancelled' } });
    const result = await requestCancellation(client, { customerId: 'c1', orderId: 'o1' }, { deliver });
    expect(result).toEqual({ status: 'ineligible', reason: 'already_cancelled' });
  });

  it('auto-cancels a confirmed, unpaid order and sends the approved email', async () => {
    const { client, calls } = fakeClient({ order: orderRow, pendingRequest: null });
    const result = await requestCancellation(client, { customerId: 'c1', orderId: 'o1', reason: 'changed my mind' }, { deliver, orderUrlBase: 'https://example.com' });
    expect(result).toEqual({ status: 'auto_cancelled' });
    expect(calls).toContainEqual(expect.objectContaining({ table: 'orders', op: 'update', payload: expect.objectContaining({ fulfillment_status: 'cancelled', payment_status: 'cancelled' }) }));
    expect(calls).toContainEqual(expect.objectContaining({ table: 'order_events', op: 'insert' }));
    expect(deliver).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ type: 'cancel_approved', recipient: 'buyer@example.com' }), expect.anything());
  });

  it('queues a request for admin review when payment is captured', async () => {
    const { client, calls } = fakeClient({ order: { ...orderRow, payment_status: 'paid' }, pendingRequest: null });
    const result = await requestCancellation(client, { customerId: 'c1', orderId: 'o1', reason: 'please cancel' }, { deliver });
    expect(result).toEqual({ status: 'created', requestId: 'req-1' });
    const insert = calls.find((call) => call.table === 'order_cancel_requests');
    expect(insert?.payload).toEqual(expect.objectContaining({ order_id: 'o1', customer_id: 'c1', status: 'pending', reason: 'please cancel' }));
    expect(deliver).not.toHaveBeenCalled();
  });

  it('queues a request when fulfillment has started even if unpaid', async () => {
    const { client } = fakeClient({ order: { ...orderRow, fulfillment_status: 'preparing' }, pendingRequest: null });
    const result = await requestCancellation(client, { customerId: 'c1', orderId: 'o1' }, { deliver });
    expect(result).toEqual({ status: 'created', requestId: 'req-1' });
  });

  it('returns ineligible when a pending request already exists', async () => {
    const { client } = fakeClient({ order: orderRow, pendingRequest: { id: 'req-0', status: 'pending' } });
    const result = await requestCancellation(client, { customerId: 'c1', orderId: 'o1' }, { deliver });
    expect(result).toEqual({ status: 'ineligible', reason: 'request_pending' });
  });
});
```

**Query shapes the fake must support (both two-eq chains ending in `maybeSingle`):**
- orders lookup: `select(orderSelect).eq('id', orderId).eq('customer_id', customerId).maybeSingle()`
- pending-request check: `select('id').eq('order_id', orderId).eq('status', 'pending').maybeSingle()` (the order is already ownership-scoped by the first lookup, so customer_id is not needed here)

The fake above keys the returned row by table name, so both lookups resolve correctly.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/domain/cancel-actions.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `requestCancellation`**

Create `features/orders/cancel-actions.ts`:

```ts
import type { CancelEligibility } from './cancel-request';
import { canRequestCancellation, requiresReview } from './cancel-request';
import { deliverOrderNotification } from '@/features/notifications/notification-delivery';
import type { AdminIdentity } from '@/features/admin/authorization';

type CancelClient = { from: (table: string) => any };

const orderSelect = 'id,display_number,fulfillment_status,payment_status,customer_id,customer_email,locale,total_minor,subtotal_minor,delivery_fee_minor,discount_minor,public_token';

type OrderRow = {
  id: string; display_number: string; fulfillment_status: string; payment_status: string;
  customer_id: string | null; customer_email: string | null; locale: 'en' | 'ar' | 'fr';
  total_minor: number; subtotal_minor: number; delivery_fee_minor: number; discount_minor: number | null;
  public_token: string | null;
};

export type RequestCancellationResult =
  | { status: 'auto_cancelled' }
  | { status: 'created'; requestId: string }
  | { status: 'ineligible'; reason: Exclude<CancelEligibility, 'ok'> }
  | { status: 'not_found' }
  | { status: 'failure' };

export async function requestCancellation(
  client: CancelClient,
  input: { customerId: string; orderId: string; reason?: string },
  deps: { deliver?: typeof deliverOrderNotification; orderUrlBase?: string } = {},
): Promise<RequestCancellationResult> {
  const deliver = deps.deliver ?? deliverOrderNotification;
  try {
    const { data } = await client.from('orders').select(orderSelect).eq('id', input.orderId).eq('customer_id', input.customerId).maybeSingle();
    if (!data) return { status: 'not_found' };
    const order = data as OrderRow;

    const { data: pending } = await client.from('order_cancel_requests').select('id').eq('order_id', input.orderId).eq('status', 'pending').maybeSingle();
    const eligibility = canRequestCancellation({
      fulfillmentStatus: order.fulfillment_status,
      paymentStatus: order.payment_status,
      hasPendingRequest: Boolean(pending),
    });
    if (eligibility !== 'ok') return { status: 'ineligible', reason: eligibility };

    const reason = input.reason?.trim() || null;
    const now = new Date().toISOString();

    if (!requiresReview(order)) {
      const { error } = await client.from('orders').update({ fulfillment_status: 'cancelled', payment_status: 'cancelled', updated_at: now }).eq('id', order.id);
      if (error) return { status: 'failure' };
      await client.from('order_events').insert({ order_id: order.id, actor_id: input.customerId, event_type: 'cancelled', from_status: order.fulfillment_status, to_status: 'cancelled' });
      if (order.customer_email) {
        await deliver(client, {
          orderId: order.id,
          type: 'cancel_approved',
          recipient: order.customer_email,
          locale: order.locale,
          orderNumber: order.display_number,
          totalMinor: order.total_minor,
          subtotalMinor: order.subtotal_minor,
          deliveryFeeMinor: order.delivery_fee_minor,
          discountMinor: order.discount_minor ?? undefined,
          orderUrl: `${(deps.orderUrlBase ?? '').replace(/\/$/, '')}/orders/${order.id}?token=${encodeURIComponent(order.public_token ?? '')}`,
        }, deps.deliver);
      }
      return { status: 'auto_cancelled' };
    }

    const { data: created, error: insertError } = await client.from('order_cancel_requests').insert({ order_id: order.id, customer_id: input.customerId, status: 'pending', reason }).select('id').single();
    if (insertError || !created) return { status: 'failure' };
    await client.from('order_events').insert({ order_id: order.id, actor_id: input.customerId, event_type: 'cancel_requested', from_status: null, to_status: null });
    return { status: 'created', requestId: String(created.id) };
  } catch {
    return { status: 'failure' };
  }
}
```

**On the deliver call:** `deliverOrderNotification(client, input, sendNotification)` accepts an optional third transport argument. The implementation passes `deps.deliver` through as that third argument: when the test injects the `deliver` fake, the call is `deliver(client, input, fakeDeliver)` (the fake ignores its own third param); when no fake is injected, `deps.deliver` is `undefined` and the default transport runs. Use `expect.anything()` for the third argument in `toHaveBeenCalledWith` assertions when a fake is injected.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/domain/cancel-actions.test.ts`
Expected: PASS.

- [ ] **Step 5: Add `getCancelRequestForOrder` to the account repository + test**

In `features/account/account-repository.ts`, append:

```ts
export type CustomerCancelRequest = { status: string; reason: string | null; createdAt: string };

export async function getCancelRequestForOrder(client: AccountClient, userId: string, orderId: string): Promise<CustomerCancelRequest | null> {
  const { data } = await client.from('order_cancel_requests')
    .select('status,reason,created_at')
    .eq('order_id', orderId)
    .eq('customer_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return { status: String(data.status), reason: data.reason ? String(data.reason) : null, createdAt: String(data.created_at) };
}
```

Append to `tests/domain/account-repository.test.ts` (follow the existing fake-client style in that file):

```ts
it('returns the latest cancel request for an order', async () => {
  const client = { from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: { status: 'pending', reason: 'changed my mind', created_at: '2026-08-18T10:00:00.000Z' }, error: null }) }) }) }) }) }) }) };
  const request = await getCancelRequestForOrder(client as never, 'c1', 'o1');
  expect(request).toEqual({ status: 'pending', reason: 'changed my mind', createdAt: '2026-08-18T10:00:00.000Z' });
});

it('returns null when there is no cancel request', async () => {
  const client = { from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) }) }) }) };
  expect(await getCancelRequestForOrder(client as never, 'c1', 'o1')).toBeNull();
});
```

(Add `getCancelRequestForOrder` to the imports at the top of the test file.)

Run: `npx vitest run tests/domain/account-repository.test.ts`
Expected: PASS.

- [ ] **Step 6: Create the customer API route**

Create `app/api/account/orders/[id]/cancel-request/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { requestCancellation } from '@/features/orders/cancel-actions';
import { getCurrentCustomer } from '@/features/auth/customer';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getPublicOrigin } from '@/lib/origin';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const customer = await getCurrentCustomer();
  if (!customer) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  const { id } = await context.params;
  const body = (await request.json()) as { reason?: unknown };
  const reason = typeof body.reason === 'string' ? body.reason.trim() || undefined : undefined;
  const result = await requestCancellation(getAdminSupabase(), { customerId: customer.id, orderId: id, reason }, { orderUrlBase: getPublicOrigin(request) });
  if (result.status === 'not_found') return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  if (result.status === 'ineligible') return NextResponse.json({ error: result.reason }, { status: 409 });
  if (result.status === 'failure') return NextResponse.json({ error: 'Could not request cancellation' }, { status: 500 });
  if (result.status === 'created') return NextResponse.json({ ok: true, requestId: result.requestId }, { status: 201 });
  return NextResponse.json({ ok: true, autoCancelled: true }, { status: 200 });
}
```

- [ ] **Step 7: Commit**

```bash
git add features/orders/cancel-actions.ts app/api/account/orders/[id]/cancel-request/route.ts features/account/account-repository.ts tests/domain/cancel-actions.test.ts tests/domain/account-repository.test.ts
git commit -m "feat: customer cancellation request with instant-cancel and review queue"
```

---

### Task 3: Admin review service + API route

**Files:**
- Modify: `features/orders/cancel-actions.ts` (adds `reviewCancellationRequest`)
- Create: `app/api/admin/cancel-requests/[id]/route.ts`
- Test: `tests/domain/cancel-actions.test.ts` (extend)

**Interfaces:**
- Consumes: `canTransitionFulfillment` from `@/features/commerce/order-state`; `AdminIdentity` from `@/features/admin/authorization`; `deliverOrderNotification`; `getCurrentAdmin` from `@/features/auth/server`; `getAdminSupabase`; `getPublicOrigin`; `respond` from `@/lib/api`.
- Produces: `ReviewCancellationResult` (consumed by the route).

```ts
export type ReviewCancellationResult =
  | { status: 'approved' }
  | { status: 'rejected' }
  | { status: 'not_found' }
  | { status: 'not_cancellable' }
  | { status: 'failure' };

export async function reviewCancellationRequest(
  client: CancelClient,
  input: { admin: AdminIdentity; requestId: string; action: 'approve' | 'reject'; reason?: string; orderUrlBase: string },
  deps: { deliver?: typeof deliverOrderNotification } = {},
): Promise<ReviewCancellationResult>;
```

- [ ] **Step 1: Write the failing test** (append to `tests/domain/cancel-actions.test.ts`)

```ts
import { reviewCancellationRequest } from '@/features/orders/cancel-actions';

const admin = { userId: 'a1', role: 'admin' as const };

const requestWithOrder = (overrides: Record<string, unknown> = {}) => ({
  id: 'req-1', status: 'pending', reason: 'changed my mind', customer_id: 'c1', reviewed_by: null, reviewed_at: null,
  orders: { id: 'o1', display_number: 'RO-1', fulfillment_status: 'preparing', payment_status: 'paid', customer_email: 'buyer@example.com', locale: 'en', total_minor: 10000, subtotal_minor: 10000, delivery_fee_minor: 0, discount_minor: null, public_token: 'tok' },
  ...overrides,
});

function reviewClient(request: unknown) {
  const calls: Array<{ table: string; op: string; payload?: unknown }> = [];
  // The service looks up the request with select(...).eq('id', requestId).maybeSingle().
  const client = {
    from: (table: string) => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: request, error: null }) }) }),
      update: (payload: unknown) => ({ eq: (_col: string, id: string) => { calls.push({ table, op: 'update', payload }); return { error: null }; } }),
      insert: (payload: unknown) => { calls.push({ table, op: 'insert', payload }); return { error: null }; },
    }),
  };
  return { client, calls };
}

describe('reviewCancellationRequest', () => {
  it('returns not_found when the request is missing', async () => {
    const { client } = reviewClient(null);
    expect(await reviewCancellationRequest(client, { admin, requestId: 'req-x', action: 'approve', orderUrlBase: 'https://example.com' }, { deliver })).toEqual({ status: 'not_found' });
  });

  it('approves and cancels a paid order, marking the payment refunded', async () => {
    const { client, calls } = reviewClient(requestWithOrder());
    const result = await reviewCancellationRequest(client, { admin, requestId: 'req-1', action: 'approve', reason: 'ok', orderUrlBase: 'https://example.com' }, { deliver });
    expect(result).toEqual({ status: 'approved' });
    expect(calls).toContainEqual(expect.objectContaining({ table: 'orders', op: 'update', payload: expect.objectContaining({ fulfillment_status: 'cancelled', payment_status: 'refunded' }) }));
    expect(calls).toContainEqual(expect.objectContaining({ table: 'order_cancel_requests', op: 'update', payload: expect.objectContaining({ status: 'approved', reviewed_by: 'a1' }) }));
    expect(calls).toContainEqual(expect.objectContaining({ table: 'admin_audit_logs', op: 'insert' }));
    expect(deliver).toHaveBeenCalled();
  });

  it('cancels an unpaid order with payment_status cancelled', async () => {
    const { client, calls } = reviewClient(requestWithOrder({ orders: { ...requestWithOrder().orders, payment_status: 'payment_failed' } }));
    await reviewCancellationRequest(client, { admin, requestId: 'req-1', action: 'approve', orderUrlBase: 'https://example.com' }, { deliver });
    expect(calls).toContainEqual(expect.objectContaining({ table: 'orders', op: 'update', payload: expect.objectContaining({ payment_status: 'cancelled' }) }));
  });

  it('returns not_cancellable when the order was already delivered', async () => {
    const { client } = reviewClient(requestWithOrder({ orders: { ...requestWithOrder().orders, fulfillment_status: 'delivered' } }));
    expect(await reviewCancellationRequest(client, { admin, requestId: 'req-1', action: 'approve', orderUrlBase: 'https://example.com' }, { deliver })).toEqual({ status: 'not_cancellable' });
  });

  it('rejects the request and sends the rejected email', async () => {
    const { client, calls } = reviewClient(requestWithOrder());
    const result = await reviewCancellationRequest(client, { admin, requestId: 'req-1', action: 'reject', reason: 'too late', orderUrlBase: 'https://example.com' }, { deliver });
    expect(result).toEqual({ status: 'rejected' });
    expect(calls).toContainEqual(expect.objectContaining({ table: 'order_cancel_requests', op: 'update', payload: expect.objectContaining({ status: 'rejected', reason: 'too late', reviewed_by: 'a1' }) }));
    expect(calls).toContainEqual(expect.objectContaining({ table: 'order_events', op: 'insert', payload: expect.objectContaining({ event_type: 'cancel_rejected' }) }));
    expect(deliver).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ type: 'cancel_rejected' }), expect.anything());
  });

  it('returns not_cancellable for an already-reviewed request', async () => {
    const { client } = reviewClient(requestWithOrder({ status: 'approved' }));
    expect(await reviewCancellationRequest(client, { admin, requestId: 'req-1', action: 'approve', orderUrlBase: 'https://example.com' }, { deliver })).toEqual({ status: 'not_cancellable' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/domain/cancel-actions.test.ts`
Expected: FAIL — `reviewCancellationRequest is not a function`.

- [ ] **Step 3: Implement `reviewCancellationRequest`** (append to `features/orders/cancel-actions.ts`)

```ts
import { canTransitionFulfillment } from '@/features/commerce/order-state';

export type ReviewCancellationResult =
  | { status: 'approved' }
  | { status: 'rejected' }
  | { status: 'not_found' }
  | { status: 'not_cancellable' }
  | { status: 'failure' };

export async function reviewCancellationRequest(
  client: CancelClient,
  input: { admin: AdminIdentity; requestId: string; action: 'approve' | 'reject'; reason?: string; orderUrlBase: string },
  deps: { deliver?: typeof deliverOrderNotification } = {},
): Promise<ReviewCancellationResult> {
  const deliver = deps.deliver ?? deliverOrderNotification;
  try {
    const { data } = await client.from('order_cancel_requests').select(`*,orders(${orderSelect})`).eq('id', input.requestId).maybeSingle();
    if (!data || !data.orders) return { status: 'not_found' };
    const request = data as { id: string; status: string; reason: string | null; orders: OrderRow };
    const order = request.orders;
    if (request.status !== 'pending') return { status: 'not_cancellable' };
    const reason = input.reason?.trim() || null;
    const now = new Date().toISOString();
    const emailBase = {
      orderId: order.id,
      recipient: order.customer_email ?? '',
      locale: order.locale,
      orderNumber: order.display_number,
      totalMinor: order.total_minor,
      subtotalMinor: order.subtotal_minor,
      deliveryFeeMinor: order.delivery_fee_minor,
      discountMinor: order.discount_minor ?? undefined,
      orderUrl: `${input.orderUrlBase.replace(/\/$/, '')}/orders/${order.id}?token=${encodeURIComponent(order.public_token ?? '')}`,
    };

    if (input.action === 'reject') {
      const { error } = await client.from('order_cancel_requests').update({ status: 'rejected', reason, reviewed_by: input.admin.userId, reviewed_at: now }).eq('id', input.requestId);
      if (error) return { status: 'failure' };
      await client.from('order_events').insert({ order_id: order.id, actor_id: input.admin.userId, event_type: 'cancel_rejected', from_status: null, to_status: null });
      await client.from('admin_audit_logs').insert({ actor_id: input.admin.userId, action: 'reject_cancellation', target_type: 'order', target_id: order.id, metadata: { request_id: input.requestId, reason } });
      if (order.customer_email) await deliver(client, { ...emailBase, type: 'cancel_rejected' }, deps.deliver);
      return { status: 'rejected' };
    }

    if (!canTransitionFulfillment(order.fulfillment_status as never, 'cancelled')) return { status: 'not_cancellable' };
    const { error: requestError } = await client.from('order_cancel_requests').update({ status: 'approved', reason, reviewed_by: input.admin.userId, reviewed_at: now }).eq('id', input.requestId);
    const { error: orderError } = await client.from('orders').update({ fulfillment_status: 'cancelled', payment_status: order.payment_status === 'paid' ? 'refunded' : 'cancelled', updated_at: now }).eq('id', order.id);
    if (requestError || orderError) return { status: 'failure' };
    await client.from('order_events').insert({ order_id: order.id, actor_id: input.admin.userId, event_type: 'cancelled', from_status: order.fulfillment_status, to_status: 'cancelled' });
    await client.from('admin_audit_logs').insert({ actor_id: input.admin.userId, action: 'approve_cancellation', target_type: 'order', target_id: order.id, metadata: { request_id: input.requestId } });
    if (order.customer_email) await deliver(client, { ...emailBase, type: 'cancel_approved' }, deps.deliver);
    return { status: 'approved' };
  } catch {
    return { status: 'failure' };
  }
}
```

**Note:** `canTransitionFulfillment` is typed over the `FulfillmentStatus` union; cast the row values (`as never` or `as FulfillmentStatus`) since DB rows are plain strings. The fake's `select().maybeSingle()` must resolve the embedded `orders` object for the tests above.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/domain/cancel-actions.test.ts`
Expected: PASS (Task 2 + Task 3 tests).

- [ ] **Step 5: Create the admin API route**

Create `app/api/admin/cancel-requests/[id]/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { reviewCancellationRequest } from '@/features/orders/cancel-actions';
import { getCurrentAdmin } from '@/features/auth/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getPublicOrigin } from '@/lib/origin';
import { respond } from '@/lib/api';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Admin authorization required' }, { status: 403 });
  const { id } = await context.params;
  const body = (await request.json()) as { action?: unknown; reason?: unknown };
  if (body.action !== 'approve' && body.action !== 'reject') return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  const reason = typeof body.reason === 'string' ? body.reason.trim() || undefined : undefined;
  const result = await reviewCancellationRequest(getAdminSupabase(), { admin, requestId: id, action: body.action, reason, orderUrlBase: getPublicOrigin(request) });
  return respond(result, {
    not_found: { status: 404, error: 'Request not found' },
    not_cancellable: { status: 409, error: 'Order is no longer cancellable' },
    failure: { status: 500, error: 'Could not review cancellation' },
  }, { ok: true, status: result.status });
}
```

- [ ] **Step 6: Commit**

```bash
git add features/orders/cancel-actions.ts app/api/admin/cancel-requests/[id]/route.ts tests/domain/cancel-actions.test.ts
git commit -m "feat: admin approve/reject cancellation requests"
```

---

### Task 4: Cancellation email types, templates, retry, labels

**Files:**
- Modify: `features/notifications/email-types.ts`
- Modify: `features/notifications/email-templates.ts`
- Modify: `features/notifications/notification-retry.ts`
- Modify: `features/admin/notification-type-labels.ts`
- Test: `tests/domain/email-templates.test.ts` (extend)

**Interfaces:**
- Consumes: the `NotificationType` union; `renderOrderEmail`.
- Produces: `'cancel_approved' | 'cancel_rejected'` as valid `NotificationType`s (consumed by Task 2/3 services and the retry cron).

- [ ] **Step 1: Extend the email types**

In `features/notifications/email-types.ts`, change the union to:

```ts
export type NotificationType = 'order_received' | 'payment_confirmed' | 'payment_failed' | 'preparing' | 'ready_for_delivery' | 'out_for_delivery' | 'delivered' | 'cancel_approved' | 'cancel_rejected';
```

- [ ] **Step 2: Extend the templates**

In `features/notifications/email-templates.ts`, add to each locale's `subjects` object:

```ts
// en
cancel_approved: 'Your cancellation was confirmed', cancel_rejected: 'Cancellation request declined',
// ar
cancel_approved: 'تم تأكيد إلغاء طلبك', cancel_rejected: 'تم رفض طلب الإلغاء',
// fr
cancel_approved: 'Votre annulation a été confirmée', cancel_rejected: 'Demande d’annulation refusée',
```

TypeScript enforces this: `subjects[input.locale][input.type]` must index every new type in every locale, so the build fails until all three are updated.

- [ ] **Step 3: Extend the retry set + admin labels**

In `features/notifications/notification-retry.ts`, add both types to `NOTIFICATION_TYPES`.

In `features/admin/notification-type-labels.ts`, add:

```ts
cancel_approved: 'emailCancelApproved',
cancel_rejected: 'emailCancelRejected',
```

- [ ] **Step 4: Write the failing test** (append to `tests/domain/email-templates.test.ts`)

```ts
import { NOTIFICATION_TYPES } from '@/features/notifications/notification-retry';

it('renders cancellation subjects in all three locales', () => {
  expect(renderOrderEmail({ locale: 'en', type: 'cancel_approved', orderNumber: 'RO-1', totalMinor: 10000, orderUrl: 'https://example.com/o/1' }).subject).toBe('Your cancellation was confirmed');
  expect(renderOrderEmail({ locale: 'ar', type: 'cancel_approved', orderNumber: 'RO-1', totalMinor: 10000, orderUrl: 'https://example.com/o/1' }).subject).toBe('تم تأكيد إلغاء طلبك');
  expect(renderOrderEmail({ locale: 'fr', type: 'cancel_rejected', orderNumber: 'RO-1', totalMinor: 10000, orderUrl: 'https://example.com/o/1' }).subject).toBe('Demande d’annulation refusée');
});

it('includes cancellation types in the retryable notification set', () => {
  expect(NOTIFICATION_TYPES.has('cancel_approved')).toBe(true);
  expect(NOTIFICATION_TYPES.has('cancel_rejected')).toBe(true);
});
```

- [ ] **Step 5: Run test — verify it fails first, then passes after Steps 1–3**

Run: `npx vitest run tests/domain/email-templates.test.ts`
Expected after Step 1–3 edits: PASS. (If run before editing, the subject assertions fail because `cancel_approved` is not yet a valid type — TS compile error or undefined subject. The typecheck step at the end catches missing locales.)

- [ ] **Step 6: Commit**

```bash
git add features/notifications/email-types.ts features/notifications/email-templates.ts features/notifications/notification-retry.ts features/admin/notification-type-labels.ts tests/domain/email-templates.test.ts
git commit -m "feat: cancellation email types, templates, retry, and admin labels"
```

---

### Task 5: UI — customer + admin + i18n

**Files:**
- Create: `components/account/CancelRequestButton.tsx`
- Create: `components/admin/CancelRequestReview.tsx`
- Modify: `app/[locale]/[city]/account/(dashboard)/orders/[id]/page.tsx`
- Modify: `app/admin/orders/[id]/page.tsx`
- Modify: `features/i18n/dictionaries.ts` (EN, AR, FR lines)
- Test: `tests/components/CancelRequestButton.test.tsx` (new)

**Interfaces:**
- Consumes: `getCancelRequestForOrder` (Task 2), `canRequestCancellation` (Task 1), the two API routes.

- [ ] **Step 1: Add i18n keys** (append to the blog/author segment of each locale line in `features/i18n/dictionaries.ts`, keeping EN/AR/FR in sync)

```ts
// EN
requestCancellation: 'Request cancellation', cancellationReason: 'Reason (optional)', cancelRequestPending: 'Cancellation requested — pending review', cancelRequestApproved: 'Cancellation approved — the order was cancelled', cancelRequestRejected: 'Cancellation request declined', approveCancellation: 'Approve', rejectCancellation: 'Reject', rejectionReason: 'Reason for rejection (optional)', cancelRequests: 'Cancellation requests', noCancelRequests: 'No cancellation requests', couldNotRequestCancellation: 'Could not request cancellation.', couldNotReviewCancellation: 'Could not review the cancellation request.', cancellationRequestedBy: 'Requested by', emailCancelApproved: 'Cancellation approved', emailCancelRejected: 'Cancellation declined',
// AR
requestCancellation: 'طلب إلغاء', cancellationReason: 'السبب (اختياري)', cancelRequestPending: 'تم طلب الإلغاء — بانتظار المراجعة', cancelRequestApproved: 'تمت الموافقة على الإلغاء — تم إلغاء الطلب', cancelRequestRejected: 'تم رفض طلب الإلغاء', approveCancellation: 'موافقة', rejectCancellation: 'رفض', rejectionReason: 'سبب الرفض (اختياري)', cancelRequests: 'طلبات الإلغاء', noCancelRequests: 'لا توجد طلبات إلغاء', couldNotRequestCancellation: 'تعذر طلب الإلغاء.', couldNotReviewCancellation: 'تعذرت مراجعة طلب الإلغاء.', cancellationRequestedBy: 'مقدَّم من', emailCancelApproved: 'تمت الموافقة على الإلغاء', emailCancelRejected: 'تم رفض الإلغاء',
// FR
requestCancellation: 'Demander l’annulation', cancellationReason: 'Motif (facultatif)', cancelRequestPending: 'Annulation demandée — en attente de validation', cancelRequestApproved: 'Annulation approuvée — la commande a été annulée', cancelRequestRejected: 'Demande d’annulation refusée', approveCancellation: 'Approuver', rejectCancellation: 'Refuser', rejectionReason: 'Motif du refus (facultatif)', cancelRequests: 'Demandes d’annulation', noCancelRequests: 'Aucune demande d’annulation', couldNotRequestCancellation: 'Impossible de demander l’annulation.', couldNotReviewCancellation: 'Impossible de traiter la demande d’annulation.', cancellationRequestedBy: 'Demandé par', emailCancelApproved: 'Annulation approuvée', emailCancelRejected: 'Annulation refusée',
```

- [ ] **Step 2: Create the customer button component**

Create `components/account/CancelRequestButton.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useI18n } from '@/features/i18n/I18nProvider';

export function CancelRequestButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const { t } = useI18n();
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError('');
    const response = await fetch(`/api/account/orders/${orderId}/cancel-request`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: reason.trim() || undefined }) });
    if (!response.ok) { setError(t('couldNotRequestCancellation')); setBusy(false); return; }
    router.refresh();
  }

  return <div className="grid gap-2"><Textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={2} placeholder={t('cancellationReason')} /><Button variant="outline" onClick={submit} disabled={busy}>{t('requestCancellation')}</Button>{error ? <small className="text-sm text-destructive">{error}</small> : null}</div>;
}
```

- [ ] **Step 3: Create the admin review component**

Create `components/admin/CancelRequestReview.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/features/i18n/I18nProvider';

export function CancelRequestReview({ requestId }: { requestId: string }) {
  const router = useRouter();
  const { t } = useI18n();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function review(action: 'approve' | 'reject') {
    setBusy(true);
    setError('');
    const response = await fetch(`/api/admin/cancel-requests/${requestId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, reason: action === 'reject' && reason.trim() ? reason.trim() : undefined }) });
    if (!response.ok) { setError(t('couldNotReviewCancellation')); setBusy(false); return; }
    router.refresh();
  }

  return <div className="grid gap-2"><Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder={t('rejectionReason')} /><span className="flex items-center gap-2"><Button size="sm" onClick={() => review('approve')} disabled={busy}>{t('approveCancellation')}</Button><Button size="sm" variant="outline" onClick={() => review('reject')} disabled={busy}>{t('rejectCancellation')}</Button>{error ? <small className="text-sm text-destructive">{error}</small> : null}</span></div>;
}
```

- [ ] **Step 4: Write the button component test**

Create `tests/components/CancelRequestButton.test.tsx` (mirrors `AuthorDeleteButton`-style tests; mock `next/navigation`):

```tsx
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CancelRequestButton } from '@/components/account/CancelRequestButton';
import { renderWithProviders } from '../test-utils';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

describe('CancelRequestButton', () => {
  it('posts a cancellation request and refreshes on success', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<CancelRequestButton orderId="o1" />);
    fireEvent.change(screen.getByPlaceholderText(/reason/i), { target: { value: 'changed my mind' } });
    fireEvent.click(screen.getByRole('button', { name: /request cancellation/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/account/orders/o1/cancel-request', expect.objectContaining({ method: 'POST' })));
    expect(refresh).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('shows an error when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    renderWithProviders(<CancelRequestButton orderId="o1" />);
    fireEvent.click(screen.getByRole('button', { name: /request cancellation/i }));
    await waitFor(() => expect(screen.getByText(/could not request/i)).toBeInTheDocument());
    vi.unstubAllGlobals();
  });
});
```

- [ ] **Step 5: Wire the customer page** — in `app/[locale]/[city]/account/(dashboard)/orders/[id]/page.tsx`:

Add imports: `import { CancelRequestButton } from '@/components/account/CancelRequestButton';`, `import { getCancelRequestForOrder } from '@/features/account/account-repository';`, `import { canRequestCancellation } from '@/features/orders/cancel-request';`.

After `const order = ...` and before the return, add:

```tsx
const cancelRequest = supabase ? await getCancelRequestForOrder(supabase, customer.id, order.id) : null;
const eligibility = canRequestCancellation({ fulfillmentStatus: order.fulfillmentStatus, paymentStatus: order.paymentStatus, hasPendingRequest: cancelRequest?.status === 'pending' });
```

Immediately after the items `<Card>` (before the timeline card), render the cancellation block:

```tsx
{cancelRequest?.status === 'pending' ? <Card><CardHeader><CardTitle>{t('cancelRequestPending')}</CardTitle></CardHeader><CardContent>{cancelRequest.reason ? <p className="text-sm text-muted-foreground">{t('cancellationReason')}: {cancelRequest.reason}</p> : null}</CardContent></Card>
  : cancelRequest?.status === 'approved' ? <Card><CardHeader><CardTitle>{t('cancelRequestApproved')}</CardTitle></CardHeader><CardContent>{cancelRequest.reason ? <p className="text-sm text-muted-foreground">{t('cancellationReason')}: {cancelRequest.reason}</p> : null}</CardContent></Card>
  : cancelRequest?.status === 'rejected' ? <Card><CardHeader><CardTitle>{t('cancelRequestRejected')}</CardTitle></CardHeader><CardContent>{cancelRequest.reason ? <p className="text-sm text-muted-foreground">{t('cancellationReason')}: {cancelRequest.reason}</p> : null}</CardContent></Card>
  : eligibility === 'ok' ? <Card><CardHeader><CardTitle>{t('requestCancellation')}</CardTitle></CardHeader><CardContent><CancelRequestButton orderId={order.id} /></CardContent></Card>
  : null}
```

- [ ] **Step 6: Wire the admin page** — in `app/admin/orders/[id]/page.tsx`:

Add imports: `import { CancelRequestReview } from '@/components/admin/CancelRequestReview';`.

Change the order query embed to include cancel requests:

```ts
const { data: order } = await supabase.from('orders').select('*,order_items(*),payments(*),order_events(*),notification_deliveries(*),order_cancel_requests(*)').eq('id', id).maybeSingle();
```

After the order-loading block, map the requests:

```tsx
const cancelRequests = ((order.order_cancel_requests ?? []) as Array<{ id: string; status: string; reason: string | null; created_at: string }>).sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
```

Render a card after the `recipientAndDelivery` card (or before `emailLog`):

```tsx
<Card className="mt-4"><CardHeader><CardTitle>{t('cancelRequests')}</CardTitle></CardHeader><CardContent className="grid gap-3">
  {cancelRequests.length === 0 ? <p className="text-sm text-muted-foreground">{t('noCancelRequests')}</p> : cancelRequests.map((request) => (
    <div key={request.id} className="flex flex-wrap items-center justify-between gap-3 border-b py-2">
      <div className="min-w-0"><p className="text-sm">{t('cancellationRequestedBy')} {order.customer_email}</p>{request.reason ? <p className="text-sm text-muted-foreground">{t('cancellationReason')}: {request.reason}</p> : null}<p className="text-xs text-muted-foreground">{new Date(request.created_at).toLocaleString(locale === 'ar' ? 'ar-EG' : locale === 'fr' ? 'fr-FR' : 'en-GB')}</p></div>
      {request.status === 'pending' ? <CancelRequestReview requestId={request.id} /> : <Badge variant={request.status === 'approved' ? 'success' : 'default'}>{request.status === 'approved' ? t('cancelRequestApproved') : t('cancelRequestRejected')}</Badge>}
    </div>
  ))}
</CardContent></Card>
```

**Note:** verify that `Badge` supports a `'success'` variant (Task 3 of the admin-ui-ux-audit added success/warning variants) and that `order.customer_email` is available on the admin page's order object — it is, the query selects `*`.

- [ ] **Step 7: Run the component test + typecheck**

Run: `npx vitest run tests/components/CancelRequestButton.test.tsx`
Expected: PASS.

Run: `npm run lint`
Expected: clean (catches any missing i18n key in a locale or unused import).

- [ ] **Step 8: Commit**

```bash
git add components/account/CancelRequestButton.tsx components/admin/CancelRequestReview.tsx "app/[locale]/[city]/account/(dashboard)/orders/[id]/page.tsx" app/admin/orders/[id]/page.tsx features/i18n/dictionaries.ts tests/components/CancelRequestButton.test.tsx
git commit -m "feat: cancellation request UI on account and admin order pages"
```

---

### Task 6: Full gate + merge + push

**Files:** none (verification only)

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: all pass (baseline 333 + ~24 new ≈ 357).

- [ ] **Step 2: Typecheck**

Run: `npm run lint`
Expected: clean, exit 0.

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: exit 0; new routes `/api/account/orders/[id]/cancel-request` and `/api/admin/cancel-requests/[id]` appear in the route table.

- [ ] **Step 4: Discard generated churn**

If `next-env.d.ts` or `package-lock.json` were modified by the build, run `git checkout -- next-env.d.ts package-lock.json` (they are generated noise, as in prior sessions).

- [ ] **Step 5: Final diff review + commit any stragglers**

Run: `git status --short` and `git diff --stat` — confirm only feature files are present. If the runbook should mention manual refunds for approved cancellations, add one line to `docs/setup/runbook.md` (Section 9 or Troubleshooting) and commit it.

- [ ] **Step 6: Merge + push (after user approval)**

Push `master` (rebase on `origin/master` if the parallel session moved the remote, then re-run `npm run lint` + `npm test` before pushing).
