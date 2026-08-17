# Admin Order Manager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the thin read-only `/admin/orders` page into an operational order manager: searchable/filterable list, full order detail page, role-aware fulfillment transitions, milestone emails, and one-click WhatsApp contact.

**Architecture:** Server components read via the admin (service-role) Supabase client; a single authorized mutation API (`POST /api/admin/orders/[id]/status`) delegates to a testable service (`updateFulfillmentStatus`) that writes the order update, event, audit, and (for milestones) enqueues + sends the bilingual email; a small client component renders legal transition buttons and refreshes.

**Tech Stack:** Next.js 16 App Router (server components + client components), TypeScript strict, Supabase (postgrest-js), Vitest, `@/` path alias.

**Spec:** `docs/superpowers/specs/2026-08-17-admin-order-manager-design.md`

## Global Constraints

- TypeScript strict; `npm run lint` runs `tsc --noEmit` and must pass.
- Vitest for tests; new tests live in `tests/domain/*.test.ts`; `@/` resolves to repo root.
- Money is stored in minor units (piasters); display by dividing by 100.
- Admin UI is English-only.
- Fulfillment states: `confirmed → preparing → ready_for_delivery → out_for_delivery → delivered`, plus `cancelled` from `confirmed/preparing/ready_for_delivery`.
- Operators cannot cancel (see `canUpdateOrderStatus`).
- Milestone emails only for `out_for_delivery` and `delivered`; email failure never changes the transition result.
- No secrets in code or tests; tests use fakes only, never live services.
- TDD: write the failing test, run it (red), implement, run it (green), commit.
- All 56 existing tests stay passing.

---

### Task 1: Admin WhatsApp contact helper

**Files:**
- Modify: `features/support/whatsapp.ts`
- Test: `tests/domain/admin-whatsapp.test.ts`

**Interfaces:**
- Consumes: existing `normalizeNumber` in `features/support/whatsapp.ts`.
- Produces: `createAdminWhatsAppHref(input: { number: string; orderId: string }): string | null` — `null` when the number has no digits; otherwise `https://wa.me/<digits>?text=<encoded "Hello! This is Rosette regarding your order <orderId>.">`.

- [ ] **Step 1: Write the failing test**

`tests/domain/admin-whatsapp.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createAdminWhatsAppHref } from '@/features/support/whatsapp';

describe('createAdminWhatsAppHref', () => {
  it('normalizes the number to digits and prefills the order text', () => {
    const href = createAdminWhatsAppHref({ number: '+20 100 000 0000', orderId: 'RO-ABC123' });
    expect(href).toBe(`https://wa.me/201000000000?text=${encodeURIComponent('Hello! This is Rosette regarding your order RO-ABC123.')}`);
  });

  it('returns null when the number has no digits', () => {
    expect(createAdminWhatsAppHref({ number: '+() -', orderId: 'RO-1' })).toBeNull();
    expect(createAdminWhatsAppHref({ number: '', orderId: 'RO-1' })).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/domain/admin-whatsapp.test.ts`
Expected: FAIL — `createAdminWhatsAppHref` is not exported.

- [ ] **Step 3: Implement**

Append to `features/support/whatsapp.ts` (below the existing `getConfiguredWhatsAppHref`):

```ts
export function createAdminWhatsAppHref(input: { number: string; orderId: string }): string | null {
  const digits = normalizeNumber(input.number);
  if (!digits) return null;
  const text = `Hello! This is Rosette regarding your order ${input.orderId}.`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/domain/admin-whatsapp.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add features/support/whatsapp.ts tests/domain/admin-whatsapp.test.ts
git commit -m "feat: add admin WhatsApp contact href helper"
```

---

### Task 2: Order list query builder

**Files:**
- Create: `features/admin/order-list-query.ts`
- Test: `tests/domain/order-list-query.test.ts`

**Interfaces:**
- Consumes: `PaymentStatus`, `FulfillmentStatus` types from `@/features/commerce/order-state`.
- Produces:
  - `type OrderListParams = { q?: string; payment?: string; fulfillment?: string }`
  - `type OrderListConstraints = { search?: string; paymentStatus?: PaymentStatus; fulfillmentStatus?: FulfillmentStatus }`
  - `buildOrderListQuery(params: OrderListParams): OrderListConstraints` — trims `q` into `search`; copies `payment`/`fulfillment` only when they are valid status values; ignores everything else.

- [ ] **Step 1: Write the failing test**

`tests/domain/order-list-query.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildOrderListQuery } from '@/features/admin/order-list-query';

describe('buildOrderListQuery', () => {
  it('maps a trimmed search term', () => {
    expect(buildOrderListQuery({ q: '  RO-123  ' })).toEqual({ search: 'RO-123' });
  });

  it('keeps valid status filters', () => {
    expect(buildOrderListQuery({ payment: 'paid', fulfillment: 'out_for_delivery' })).toEqual({ paymentStatus: 'paid', fulfillmentStatus: 'out_for_delivery' });
  });

  it('ignores invalid status values and empty params', () => {
    expect(buildOrderListQuery({ q: '', payment: 'bogus', fulfillment: 'nope' })).toEqual({});
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/domain/order-list-query.test.ts`
Expected: FAIL — module `@/features/admin/order-list-query` not found.

- [ ] **Step 3: Implement**

`features/admin/order-list-query.ts`:

```ts
import type { FulfillmentStatus, PaymentStatus } from '@/features/commerce/order-state';

export type OrderListParams = { q?: string; payment?: string; fulfillment?: string };
export type OrderListConstraints = { search?: string; paymentStatus?: PaymentStatus; fulfillmentStatus?: FulfillmentStatus };

const paymentStatuses = new Set<PaymentStatus>(['pending', 'payment_started', 'paid', 'payment_failed', 'cancelled', 'refunded']);
const fulfillmentStatuses = new Set<FulfillmentStatus>(['confirmed', 'preparing', 'ready_for_delivery', 'out_for_delivery', 'delivered', 'cancelled']);

export function buildOrderListQuery(params: OrderListParams): OrderListConstraints {
  const constraints: OrderListConstraints = {};
  const search = params.q?.trim();
  if (search) constraints.search = search;
  if (params.payment && paymentStatuses.has(params.payment as PaymentStatus)) constraints.paymentStatus = params.payment as PaymentStatus;
  if (params.fulfillment && fulfillmentStatuses.has(params.fulfillment as FulfillmentStatus)) constraints.fulfillmentStatus = params.fulfillment as FulfillmentStatus;
  return constraints;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/domain/order-list-query.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add features/admin/order-list-query.ts tests/domain/order-list-query.test.ts
git commit -m "feat: add order list query builder"
```

---

### Task 3: Fulfillment status service with milestone emails

**Files:**
- Create: `features/admin/order-actions.ts`
- Test: `tests/domain/order-actions.test.ts`

**Interfaces:**
- Consumes:
  - `canUpdateOrderStatus`, `AdminIdentity` from `@/features/admin/authorization`
  - `FulfillmentStatus` from `@/features/commerce/order-state`
  - `sendOrderNotification` from `@/features/notifications/notification-service`
  - `NotificationType` from `@/features/notifications/email-types`
- Produces:
  - `type UpdateStatusResult = 'updated' | 'missing_order' | 'invalid_or_unauthorized' | 'failure'`
  - `updateFulfillmentStatus(client, input, deps?): Promise<UpdateStatusResult>`
    - `client`: minimal structural Supabase client (`{ from: (table: string) => any }`) — the admin client satisfies it
    - `input: { admin: AdminIdentity; orderId: string; status: FulfillmentStatus; orderUrlBase: string }`
    - `deps?: { sendNotification?: typeof sendOrderNotification }` — tests inject a fake; defaults to the real sender
  - Behavior: read order → reject missing → reject illegal/unauthorized transition → update order → insert `order_events` + `admin_audit_logs` → for `out_for_delivery`/`delivered` enqueue + attempt email → return `'updated'`. Email failure never changes the result.

- [ ] **Step 1: Write the failing test**

`tests/domain/order-actions.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { updateFulfillmentStatus } from '@/features/admin/order-actions';

type OrderRow = { id: string; display_number: string; total_minor: number; public_token: string; customer_email: string | null; locale: 'en' | 'ar'; fulfillment_status: string };
type Call = { table: string; op: string; payload?: unknown; id?: string };

function fakeClient(seed: { order: OrderRow | null; failUpdate?: boolean }) {
  const calls: Call[] = [];
  const from = (table: string) => ({
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: seed.order, error: null }) }) }),
    update: (payload: unknown) => ({ eq: (id: string) => { calls.push({ table, op: 'update', payload, id }); return { error: seed.failUpdate ? { message: 'boom' } : null }; } }),
    insert: (payload: unknown) => { calls.push({ table, op: 'insert', payload }); return { select: () => ({ single: async () => ({ data: { id: 'notif-1' }, error: null }) }), eq: () => ({}) }; },
  });
  return { client: { from }, calls };
}

const admin = { userId: 'admin-1', role: 'admin' as const };
const baseOrder: OrderRow = { id: 'o1', display_number: 'RO-123', total_minor: 12300, public_token: 'tok', customer_email: 'buyer@example.com', locale: 'en', fulfillment_status: 'confirmed' };
const baseInput = { admin, orderId: 'o1', orderUrlBase: 'https://shop.example.com' };

const sendOk = async () => ({ accepted: true as const });

describe('updateFulfillmentStatus', () => {
  it('updates the order and writes event + audit, with no notification for non-milestones', async () => {
    const { client, calls } = fakeClient({ order: baseOrder });
    const result = await updateFulfillmentStatus(client, { ...baseInput, status: 'preparing' }, { sendNotification: sendOk });
    expect(result).toBe('updated');
    expect(calls.map((c) => `${c.table}:${c.op}`)).toEqual(expect.arrayContaining(['orders:update', 'order_events:insert', 'admin_audit_logs:insert']));
    expect(calls.find((c) => c.table === 'notification_deliveries')).toBeUndefined();
  });

  it('rejects an illegal transition with no writes', async () => {
    const { client, calls } = fakeClient({ order: { ...baseOrder, fulfillment_status: 'delivered' } });
    const result = await updateFulfillmentStatus(client, { ...baseInput, status: 'confirmed' }, { sendNotification: sendOk });
    expect(result).toBe('invalid_or_unauthorized');
    expect(calls).toEqual([]);
  });

  it('rejects a cancel by an operator', async () => {
    const operator = { userId: 'op-1', role: 'operator' as const };
    const { client, calls } = fakeClient({ order: baseOrder });
    const result = await updateFulfillmentStatus(client, { ...baseInput, admin: operator, status: 'cancelled' }, { sendNotification: sendOk });
    expect(result).toBe('invalid_or_unauthorized');
    expect(calls).toEqual([]);
  });

  it('returns missing_order when the order does not exist', async () => {
    const { client } = fakeClient({ order: null });
    const result = await updateFulfillmentStatus(client, { ...baseInput, status: 'preparing' }, { sendNotification: sendOk });
    expect(result).toBe('missing_order');
  });

  it('returns failure when the order update errors', async () => {
    const { client, calls } = fakeClient({ order: baseOrder, failUpdate: true });
    const result = await updateFulfillmentStatus(client, { ...baseInput, status: 'preparing' }, { sendNotification: sendOk });
    expect(result).toBe('failure');
    expect(calls.filter((c) => c.table === 'order_events')).toEqual([]);
  });

  it('enqueues and sends a milestone email for out_for_delivery', async () => {
    const { client, calls } = fakeClient({ order: { ...baseOrder, fulfillment_status: 'ready_for_delivery' } });
    const result = await updateFulfillmentStatus(client, { ...baseInput, status: 'out_for_delivery' }, { sendNotification: sendOk });
    expect(result).toBe('updated');
    const inserted = calls.find((c) => c.table === 'notification_deliveries' && c.op === 'insert');
    expect(inserted).toBeDefined();
    expect(inserted!.payload).toMatchObject({ order_id: 'o1', type: 'out_for_delivery', recipient: 'buyer@example.com', locale: 'en', status: 'pending' });
    const updated = calls.find((c) => c.table === 'notification_deliveries' && c.op === 'update');
    expect(updated).toBeDefined();
    expect(updated!.payload).toMatchObject({ status: 'sent' });
  });

  it('marks the notification failed but still succeeds the transition when the email send fails', async () => {
    const { client, calls } = fakeClient({ order: { ...baseOrder, fulfillment_status: 'ready_for_delivery' } });
    const sendFail = async () => ({ accepted: false as const, retryable: true as const });
    const result = await updateFulfillmentStatus(client, { ...baseInput, status: 'out_for_delivery' }, { sendNotification: sendFail });
    expect(result).toBe('updated');
    const updated = calls.find((c) => c.table === 'notification_deliveries' && c.op === 'update');
    expect(updated!.payload).toMatchObject({ status: 'failed' });
  });

  it('does not enqueue a notification when the order has no email', async () => {
    const { client, calls } = fakeClient({ order: { ...baseOrder, customer_email: null, fulfillment_status: 'ready_for_delivery' } });
    const result = await updateFulfillmentStatus(client, { ...baseInput, status: 'out_for_delivery' }, { sendNotification: sendOk });
    expect(result).toBe('updated');
    expect(calls.find((c) => c.table === 'notification_deliveries')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/domain/order-actions.test.ts`
Expected: FAIL — module `@/features/admin/order-actions` not found.

- [ ] **Step 3: Implement**

`features/admin/order-actions.ts`:

```ts
import type { FulfillmentStatus } from '@/features/commerce/order-state';
import type { NotificationType } from '@/features/notifications/email-types';
import { sendOrderNotification } from '@/features/notifications/notification-service';
import { canUpdateOrderStatus } from './authorization';
import type { AdminIdentity } from './authorization';

export type UpdateStatusResult = 'updated' | 'missing_order' | 'invalid_or_unauthorized' | 'failure';

type OrderRow = { id: string; display_number: string; total_minor: number; public_token: string; customer_email: string | null; locale: 'en' | 'ar'; fulfillment_status: FulfillmentStatus };

type OrderActionsClient = { from: (table: string) => any };

const MILESTONE_STATUSES = new Set<FulfillmentStatus>(['out_for_delivery', 'delivered']);

const orderSelect = 'id,display_number,total_minor,public_token,customer_email,locale,fulfillment_status';

export async function updateFulfillmentStatus(
  client: OrderActionsClient,
  input: { admin: AdminIdentity; orderId: string; status: FulfillmentStatus; orderUrlBase: string },
  deps: { sendNotification?: typeof sendOrderNotification } = {},
): Promise<UpdateStatusResult> {
  const sendNotification = deps.sendNotification ?? sendOrderNotification;
  const { data } = await client.from('orders').select(orderSelect).eq('id', input.orderId).maybeSingle();
  if (!data) return 'missing_order';
  const order = data as OrderRow;
  if (!canUpdateOrderStatus(input.admin.role, order.fulfillment_status, input.status)) return 'invalid_or_unauthorized';

  const { error } = await client.from('orders').update({ fulfillment_status: input.status, updated_at: new Date().toISOString() }).eq('id', input.orderId);
  if (error) return 'failure';

  await client.from('order_events').insert({ order_id: input.orderId, actor_id: input.admin.userId, event_type: 'fulfillment_status_changed', from_status: order.fulfillment_status, to_status: input.status });
  await client.from('admin_audit_logs').insert({ actor_id: input.admin.userId, action: 'update_order_status', target_type: 'order', target_id: input.orderId, metadata: { status: input.status } });

  if (MILESTONE_STATUSES.has(input.status) && order.customer_email) {
    await enqueueMilestoneEmail(client, order, input.status, input.orderUrlBase, sendNotification);
  }
  return 'updated';
}

async function enqueueMilestoneEmail(
  client: OrderActionsClient,
  order: OrderRow,
  type: 'out_for_delivery' | 'delivered',
  orderUrlBase: string,
  sendNotification: typeof sendOrderNotification,
) {
  const { data: row, error } = await client.from('notification_deliveries').insert({ order_id: order.id, type, recipient: order.customer_email, locale: order.locale, status: 'pending' }).select('id').single();
  if (error || !row) return;
  const result = await sendNotification({
    locale: order.locale,
    type: type as NotificationType,
    orderNumber: order.display_number,
    totalMinor: order.total_minor,
    recipientEmail: order.customer_email as string,
    orderUrl: `${orderUrlBase}/orders/${order.id}?token=${encodeURIComponent(order.public_token)}`,
  });
  await client.from('notification_deliveries').update(result.accepted ? { status: 'sent', sent_at: new Date().toISOString() } : { status: 'failed', attempts: 1, last_error: 'smtp_failed' }).eq('id', row.id);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/domain/order-actions.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add features/admin/order-actions.ts tests/domain/order-actions.test.ts
git commit -m "feat: add fulfillment status service with milestone emails"
```

---

### Task 4: Thin status route, order detail page, and action buttons

**Files:**
- Modify: `app/api/admin/orders/[id]/status/route.ts` (replace body with service delegation)
- Create: `components/admin/OrderActions.tsx`
- Create: `app/admin/orders/[id]/page.tsx`

**Interfaces:**
- Consumes: `updateFulfillmentStatus`, `UpdateStatusResult` (Task 3); `canUpdateOrderStatus`, `AdminIdentity` from `@/features/admin/authorization`; `canTransitionFulfillment`, `FulfillmentStatus` from `@/features/commerce/order-state`; `createAdminWhatsAppHref` (Task 1); `getCurrentAdmin` from `@/features/auth/server`; `getAdminSupabase` from `@/lib/supabase/admin`.
- Produces:
  - Route `POST /api/admin/orders/[id]/status` — 403 no admin, 400 invalid status, 404 missing order, 409 illegal/unauthorized, 500 failure, 200 `{ ok: true, status }`.
  - `OrderActions({ orderId, transitions }: { orderId: string; transitions: FulfillmentStatus[] })` client component — renders one button per transition; POSTs; `router.refresh()` on success; inline error on failure; disabled while pending.
  - `/admin/orders/[id]` server page — full detail + action footer.

- [ ] **Step 1: Make the route a thin shell**

Replace the body of `app/api/admin/orders/[id]/status/route.ts` with:

```ts
import { NextResponse } from 'next/server';
import { updateFulfillmentStatus } from '@/features/admin/order-actions';
import { getCurrentAdmin } from '@/features/auth/server';
import type { FulfillmentStatus } from '@/features/commerce/order-state';
import { getAdminSupabase } from '@/lib/supabase/admin';

const statuses = new Set<FulfillmentStatus>(['confirmed', 'preparing', 'ready_for_delivery', 'out_for_delivery', 'delivered', 'cancelled']);

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Admin authorization required' }, { status: 403 });
  const { id } = await context.params;
  const body = (await request.json()) as { status?: unknown };
  if (typeof body.status !== 'string' || !statuses.has(body.status as FulfillmentStatus)) return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  const result = await updateFulfillmentStatus(getAdminSupabase(), { admin, orderId: id, status: body.status as FulfillmentStatus, orderUrlBase: new URL(request.url).origin });
  if (result === 'missing_order') return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  if (result === 'invalid_or_unauthorized') return NextResponse.json({ error: 'Invalid or unauthorized transition' }, { status: 409 });
  if (result === 'failure') return NextResponse.json({ error: 'Could not update order' }, { status: 500 });
  return NextResponse.json({ ok: true, status: body.status });
}
```

- [ ] **Step 2: Verify the route typechecks**

Run: `npm run lint`
Expected: no errors (tests not yet affected).

- [ ] **Step 3: Implement `OrderActions`**

`components/admin/OrderActions.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { FulfillmentStatus } from '@/features/commerce/order-state';

const labels: Record<FulfillmentStatus, string> = {
  confirmed: 'Confirmed',
  preparing: 'Preparing',
  ready_for_delivery: 'Ready for delivery',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

export function OrderActions({ orderId, transitions }: { orderId: string; transitions: FulfillmentStatus[] }) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState('');

  if (!transitions.length) return null;

  async function move(status: FulfillmentStatus) {
    setPending(status);
    setError('');
    const response = await fetch(`/api/admin/orders/${orderId}/status`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
    if (!response.ok) {
      setError('Could not update the order. Refresh and try again.');
      setPending(null);
      return;
    }
    router.refresh();
  }

  return <div className="order-actions">{error ? <p className="status-message" role="alert"><strong>{error}</strong></p> : null}{transitions.map((status) => <button key={status} className="button" disabled={pending !== null} onClick={() => void move(status)}>{pending === status ? 'Updating…' : labels[status]}</button>)}</div>;
}
```

- [ ] **Step 4: Implement the detail page**

`app/admin/orders/[id]/page.tsx`:

```tsx
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { OrderActions } from '@/components/admin/OrderActions';
import { canTransitionFulfillment } from '@/features/commerce/order-state';
import type { FulfillmentStatus } from '@/features/commerce/order-state';
import { canUpdateOrderStatus } from '@/features/admin/authorization';
import { getCurrentAdmin } from '@/features/auth/server';
import { createAdminWhatsAppHref } from '@/features/support/whatsapp';
import { getAdminSupabase } from '@/lib/supabase/admin';

const allFulfillmentStatuses: FulfillmentStatus[] = ['confirmed', 'preparing', 'ready_for_delivery', 'out_for_delivery', 'delivered', 'cancelled'];

function money(minor: number) {
  return new Intl.NumberFormat('en-EG', { style: 'currency', currency: 'EGP', maximumFractionDigits: 0 }).format(minor / 100);
}

export default async function AdminOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) redirect('/login');
  const { id } = await params;
  const supabase = getAdminSupabase();
  const { data: order } = await supabase.from('orders').select('*,order_items(*),payments(*),order_events(*)').eq('id', id).maybeSingle();
  if (!order) return <main className="content-frame"><h1>Order not found</h1><p><Link href="/admin/orders">Back to orders</Link></p></main>;

  const current = order.fulfillment_status as FulfillmentStatus;
  const transitions = allFulfillmentStatuses.filter((next) => canTransitionFulfillment(current, next) && canUpdateOrderStatus(admin.role, current, next));
  const whatsapp = createAdminWhatsAppHref({ number: order.recipient_phone, orderId: order.display_number });

  return <main className="content-frame">
    <p className="eyebrow"><Link href="/admin/orders">Orders</Link> · {order.display_number}</p>
    <h1>{order.display_number}</h1>
    <p>{money(order.total_minor)} · payment {order.payment_status} · fulfillment {order.fulfillment_status}</p>

    <section className="form-section"><p className="eyebrow">Recipient &amp; delivery</p>
      <p>{order.recipient_name} · {order.recipient_phone}</p>
      <p>{order.customer_email} · {order.delivery_city_code} · {order.delivery_date} · {order.delivery_window}</p>
      <p>{order.delivery_address}</p>
      {whatsapp ? <p><a className="button" href={whatsapp} target="_blank" rel="noopener noreferrer">Contact on WhatsApp</a></p> : null}
    </section>

    <section className="form-section"><p className="eyebrow">Items</p>
      {((order.order_items ?? []) as Array<{ id: string; product_name_en: string; unit_price_minor: number; quantity: number; add_ons: Array<{ name: string; price: number }> }>).map((item) => (
        <p key={item.id}>{item.product_name_en} × {item.quantity} · {money(item.unit_price_minor)}</p>
      ))}
    </section>

    <section className="form-section"><p className="eyebrow">Payment</p>
      {((order.payments ?? []) as Array<{ id: string; provider: string; provider_reference: string | null; amount_minor: number; status: string }>).map((payment) => (
        <p key={payment.id}>{payment.provider} · {payment.provider_reference ?? 'n/a'} · {money(payment.amount_minor)} · {payment.status}</p>
      ))}
    </section>

    <section className="form-section"><p className="eyebrow">Timeline</p>
      <ol className="order-timeline">
        {((order.order_events ?? []) as Array<{ id: string; event_type: string; from_status: string | null; to_status: string | null; created_at: string }>).map((event) => (
          <li key={event.id} className="timeline-step"><span className="timeline-dot" />{event.event_type}: {event.from_status ?? '—'} → {event.to_status ?? '—'} · {new Date(event.created_at).toLocaleString('en-GB')}</li>
        ))}
      </ol>
    </section>

    <section className="form-section"><p className="eyebrow">Update status</p>
      <OrderActions orderId={order.id} transitions={transitions} />
    </section>
  </main>;
}
```

- [ ] **Step 5: Verify typecheck and build**

Run: `npm run lint && npm run build`
Expected: both pass; `/admin/orders/[id]` is in the build output.

- [ ] **Step 6: Commit**

```bash
git add app/api/admin/orders/[id]/status/route.ts components/admin/OrderActions.tsx app/admin/orders/[id]/page.tsx
git commit -m "feat: wire admin order detail page with status transitions"
```

---

### Task 5: Searchable, filterable orders list

**Files:**
- Create: `components/admin/OrderListToolbar.tsx`
- Replace: `app/admin/orders/page.tsx`

**Interfaces:**
- Consumes: `buildOrderListQuery` (Task 2); `getCurrentAdmin`; `getAdminSupabase`; `OrderListParams` type.
- Produces:
  - `OrderListToolbar` client component — GET form with `q` (search), `payment`, `fulfillment` selects; navigates with the same URL params.
  - `/admin/orders` server page — renders toolbar + rows (display number linked to detail, recipient, email, total, payment + fulfillment statuses); newest first, limit 100.

- [ ] **Step 1: Implement `OrderListToolbar`**

`components/admin/OrderListToolbar.tsx`:

```tsx
'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { FormEvent } from 'react';

const paymentOptions = ['pending', 'payment_started', 'paid', 'payment_failed', 'cancelled', 'refunded'];
const fulfillmentOptions = ['confirmed', 'preparing', 'ready_for_delivery', 'out_for_delivery', 'delivered', 'cancelled'];

export function OrderListToolbar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const params = new URLSearchParams();
    const q = String(form.get('q') ?? '').trim();
    const payment = String(form.get('payment') ?? '');
    const fulfillment = String(form.get('fulfillment') ?? '');
    if (q) params.set('q', q);
    if (payment) params.set('payment', payment);
    if (fulfillment) params.set('fulfillment', fulfillment);
    router.push(`${pathname}${params.toString() ? `?${params}` : ''}`);
  }

  return <form className="admin-toolbar" onSubmit={submit}>
    <label className="field"><span>Search</span><input name="q" defaultValue={searchParams.get('q') ?? ''} placeholder="Order number, email, or phone" /></label>
    <label className="field"><span>Payment</span><select name="payment" defaultValue={searchParams.get('payment') ?? ''}><option value="">All</option>{paymentOptions.map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
    <label className="field"><span>Fulfillment</span><select name="fulfillment" defaultValue={searchParams.get('fulfillment') ?? ''}><option value="">All</option>{fulfillmentOptions.map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
    <button className="button" type="submit">Filter</button>
  </form>;
}
```

- [ ] **Step 2: Replace the list page**

`app/admin/orders/page.tsx`:

```tsx
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { OrderListToolbar } from '@/components/admin/OrderListToolbar';
import { buildOrderListQuery } from '@/features/admin/order-list-query';
import { getCurrentAdmin } from '@/features/auth/server';
import { getAdminSupabase } from '@/lib/supabase/admin';

function first(value: string | string[] | undefined) {
  return typeof value === 'string' ? value : undefined;
}

function money(minor: number) {
  return new Intl.NumberFormat('en-EG', { style: 'currency', currency: 'EGP', maximumFractionDigits: 0 }).format(minor / 100);
}

export default async function AdminOrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const admin = await getCurrentAdmin();
  if (!admin) redirect('/login');
  const params = await searchParams;
  const constraints = buildOrderListQuery({ q: first(params.q), payment: first(params.payment), fulfillment: first(params.fulfillment) });

  let query = getAdminSupabase().from('orders').select('id,display_number,customer_email,recipient_name,total_minor,payment_status,fulfillment_status,created_at').order('created_at', { ascending: false }).limit(100);
  if (constraints.search) query = query.or(`display_number.ilike.%${constraints.search}%,customer_email.ilike.%${constraints.search}%,customer_phone.ilike.%${constraints.search}%`);
  if (constraints.paymentStatus) query = query.eq('payment_status', constraints.paymentStatus);
  if (constraints.fulfillmentStatus) query = query.eq('fulfillment_status', constraints.fulfillmentStatus);
  const { data } = await query;

  const rows = (data ?? []) as Array<{ id: string; display_number: string; customer_email: string; recipient_name: string; total_minor: number; payment_status: string; fulfillment_status: string }>;

  return <main className="content-frame">
    <p className="eyebrow">Customer orders</p>
    <h1>Orders</h1>
    <OrderListToolbar />
    <div className="admin-table">
      {rows.length === 0 ? <p className="status-message">No orders match.</p> : rows.map((order) => (
        <article className="status-message" key={order.id}>
          <Link href={`/admin/orders/${order.id}`}><strong>{order.display_number}</strong></Link>
          <span>{order.recipient_name} · {order.customer_email} · {money(order.total_minor)} · {order.payment_status} · {order.fulfillment_status}</span>
        </article>
      ))}
    </div>
  </main>;
}
```

- [ ] **Step 3: Verify typecheck and build**

Run: `npm run lint && npm run build`
Expected: both pass.

- [ ] **Step 4: Commit**

```bash
git add components/admin/OrderListToolbar.tsx app/admin/orders/page.tsx
git commit -m "feat: add searchable filterable admin orders list"
```

---

### Task 6: Final verification

- [ ] **Step 1: Run the full gate**

Run: `npm test && npm run lint && npm run build && git diff --check`
Expected: all tests pass (56 existing + 13 new), tsc clean, build succeeds, no whitespace errors.

- [ ] **Step 2: Secret scan**

Run: `npm test -- tests/security/no-secrets.test.ts`
Expected: PASS — the repository secret scan flags any provider credential values (API keys, service-role secrets, Gmail app passwords) in tracked files. The scan walks all `ts/tsx/js/mjs/json/md/env/sql/css` files, so the docs added by this plan are covered too.

- [ ] **Step 3: Commit any stragglers**

```bash
git status --short
git add -A
git commit -m "chore: final admin order manager verification" || echo "nothing to commit"
```
