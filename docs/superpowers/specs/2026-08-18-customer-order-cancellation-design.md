# Spec: Customer order cancellation (request + review)

**Date:** 2026-08-18 · **Status:** Draft for review

## Goal

Let a signed-in customer request cancellation of one of their orders, with the safest path automated:

1. **Instant cancel** when nothing is committed — the order is still `confirmed` (no flowers being prepared) and no money has been captured.
2. **Admin review** otherwise — the request is queued and an admin approves or rejects it from the order detail page.

This reuses the existing order state machine, `order_events`, and email-notification pipeline rather than introducing a parallel lifecycle.

## Decisions (locked with the user)

- **Cancellation only** — delivery change requests (date/window/address) are out of scope; the same request/review shape could later host them.
- **Two-tier logic chosen over always-review and self-serve-only:** instant cancel is frictionless when safe; human review guards preparing orders and captured payments.
- **Refunds are store-side status only.** Approving cancellation of a `paid` order sets `payment_status = 'refunded'`; the actual Paymob refund happens manually out-of-band (the app runs on test-mode payments). Documented in the operations runbook.
- **No admin email on new requests** — pending requests surface on the admin order detail page; the admin email log stays customer-facing.

## Data model — migration `009_order_cancel_requests.sql`

```sql
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

- Review mutations (approve/reject) happen through the service-role admin client only — no customer update policy.
- `order_events.event_type` is free-form (no check constraint), so new event types need no schema change.

## Eligibility & tier logic (pure, tested)

`features/orders/cancel-request.ts`:

```ts
export type CancelEligibility =
  | 'ok'
  | 'not_found'
  | 'already_cancelled'        // fulfillment cancelled
  | 'delivered'                // fulfillment delivered
  | 'refunded'                 // payment refunded
  | 'request_pending';         // a pending request already exists

export function canRequestCancellation(order: {
  fulfillmentStatus: string; paymentStatus: string; hasPendingRequest: boolean;
}): CancelEligibility;

export function requiresReview(order: {
  fulfillmentStatus: string; paymentStatus: string;
}): boolean; // true when paymentStatus === 'paid' or fulfillmentStatus !== 'confirmed'
```

- Instant-cancel path applies when `requiresReview` is false: `fulfillment_status = 'confirmed'` **and** `payment_status in ('pending', 'payment_started', 'payment_failed')`.
- Unknown order or non-owner → `not_found` (same fail-closed shape as order tracking).

## Customer flow

**`POST /api/account/orders/[id]/cancel-request`** — body `{ reason?: string }`.

1. `getCurrentCustomer()`; 401/redirect without a session.
2. Load order (RLS-backed client, `eq('id').eq('customer_id', customer.id)`); not found → 404.
3. `canRequestCancellation` → not `ok` → 409 with the specific key.
4. If `requiresReview(order)` is false → **instant cancel**:
   - `orders.update({ fulfillment_status: 'cancelled', payment_status: 'cancelled', updated_at })`
   - `order_events` insert `event_type: 'cancelled'`, `from_status` current fulfillment → `'cancelled'`, `actor_id` customer
   - `deliverOrderNotification` type `cancel_approved`
   - respond `{ ok: true, autoCancelled: true }`
5. Otherwise → **queue**:
   - insert `order_cancel_requests` row (status `pending`, reason)
   - `order_events` insert `event_type: 'cancel_requested'`
   - respond `{ ok: true, requestId }`

## Admin flow

**`POST /api/admin/cancel-requests/[id]`** — body `{ action: 'approve' | 'reject', reason?: string }`.

1. `getCurrentAdmin()`; 403 without.
2. Load request + its order (service-role client).
3. **Approve** — guard: order must still be cancellable per `canTransitionFulfillment(fulfillment_status, 'cancelled')` (i.e. not already cancelled/delivered); otherwise → 409 `not_cancellable`.
   - request row → `status: 'approved'`, `reviewed_by`, `reviewed_at`
   - `orders.update({ fulfillment_status: 'cancelled', payment_status: paymentStatus === 'paid' ? 'refunded' : 'cancelled', updated_at })`
   - `order_events` insert `event_type: 'cancelled'` with from/to
   - `admin_audit_logs` insert
   - `deliverOrderNotification` type `cancel_approved` (customer locale, order URL via `SITE_URL`/token)
4. **Reject**:
   - request row → `status: 'rejected'`, `reviewed_by`, `reviewed_at`, reason stored
   - `order_events` insert `event_type: 'cancel_rejected'`
   - `admin_audit_logs` insert
   - `deliverOrderNotification` type `cancel_rejected`

Both actions are pure service functions in `features/orders/cancel-actions.ts` (client-passed, fake-testable), mirroring `features/admin/order-actions.ts`.

## Emails

Two new `NotificationType`s: `cancel_approved`, `cancel_rejected`.

- `features/notifications/email-types.ts` — extend the union.
- `features/notifications/email-templates.ts` — subjects + copy in EN/AR/FR (reuse the money breakdown and order URL).
- `features/notifications/notification-retry.ts` — add both to the retryable list.
- `features/admin/notification-type-labels.ts` — labels for the admin email log.

## UI

**Customer — account order detail (`/account/orders/[id]`):**
- Eligible order → "Request cancellation" section (client component): optional reason textarea + submit; shows a localized error on 409/500.
- Pending request → status card "Cancellation requested — pending review" with the submitted reason.
- Resolved → "Cancellation approved/rejected" status with reason.
- Hidden when the order is cancelled/delivered.

**Admin — order detail (`/admin/orders/[id]`):**
- New "Cancellation requests" card listing each request (customer, reason, created at) with **Approve** / **Reject** buttons (client component like `OrderActions`; reject takes an optional reason); resolved requests show their outcome.

**Data for the pages:** account repository gains `getCancelRequestForOrder(client, userId, orderId)`; admin page loads `order_cancel_requests(*)` alongside the existing embed.

## i18n keys (EN / AR / FR)

`requestCancellation`, `cancellationReason`, `cancelRequestSubmitted`, `cancelRequestPending`, `cancelRequestApproved`, `cancelRequestRejected`, `approveCancellation`, `rejectCancellation`, `rejectionReason`, `cancelRequests`, `noCancelRequests`, `couldNotRequestCancellation`, `couldNotReviewCancellation`, `cancellationRequestedBy`.

## Out of scope

- Delivery change requests (date/window/address).
- Automated Paymob refunds — store-side status only; manual refund documented.
- Inventory reservation release on cancel (matches existing admin-cancel behavior).
- Admin email notifications for new requests.

## Tests

- `tests/domain/cancel-request.test.ts` — eligibility matrix + `requiresReview` tier decisions.
- `tests/domain/cancel-actions.test.ts` — request creation (instant vs queued, ownership, 409 keys), approve/reject transitions with fake clients (events, audit, emails, race guard `not_cancellable`).
- `tests/domain/email-templates.test.ts` — new types render subjects/copy per locale (extend existing email tests).
- RLS policies verified by review (customer read/create own; no update).

## Phases

- **A:** migration `009` + pure eligibility/tier logic (TDD)
- **B:** customer request action + API route + account repository read (TDD)
- **C:** admin review action + API route (TDD)
- **D:** emails + retry + labels (TDD)
- **E:** UI (customer + admin) + i18n
- **F:** full gate (tests / tsc / build / secret scan) + merge + push
