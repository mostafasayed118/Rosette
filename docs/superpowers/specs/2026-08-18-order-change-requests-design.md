# Spec — Order change requests

Date: 2026-08-18

## Goal

Let customers request changes to an existing order (delivery date, delivery
window, recipient name/phone, delivery address, gift messages, and item
quantities) after checkout. Depending on the order's state the change either
applies instantly or waits for admin review, and any price difference is
handled automatically — charged via Paymob when the new total is higher,
refunded via the Paymob refund API when it is lower.

## Decisions (locked with the user)

- **Everything except money** — customers may change delivery date, delivery
  window, recipient name, recipient phone, delivery address, per-item gift
  messages, and item **quantities** (no adding/removing product types, no
  variant switches, no payment-method changes). The delivery **city** is not
  changeable — moving cities changes the delivery fee, which is money.
- **Auto charge/refund the delta** — the price difference is handled
  automatically: `delta > 0` → customer pays the difference via a Paymob
  intention (order change applies once the payment lands); `delta < 0` →
  refunded via the Paymob refund API (block-approval, like cancellations);
  `delta = 0` → applies immediately. Money calls only ever run for `paid`
  orders; an unpaid order simply gets the new total as what's due.
- **Two-tier like cancellations** — `confirmed` + unpaid orders auto-apply at
  submit with no admin involved; `paid` or mid-fulfillment orders go to the
  admin queue.
- Line-item unit prices come from the order's own `order_items` rows
  (`unit_price_minor` at order time), so the delta math never depends on the
  current catalog price. Discounts (`discount_minor`) and delivery fees are
  fixed.
- Out of scope: adding/removing product types, variant changes, delivery-city
  changes, quantity changes re-checking stock, edits after `applied`.

## Data model — migration `011_order_change_requests.sql`

```sql
create table if not exists public.order_change_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  customer_id uuid not null references public.profiles(id),
  -- Partial diff: only the fields being changed. Validated at submit and
  -- re-validated when the change is applied (never trust the stored diff).
  changes jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'applied', 'rejected')),
  reason text,
  -- Computed at approval/apply: new total − old total (minor units).
  delta_minor integer,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists order_change_requests_order_idx on public.order_change_requests(order_id);
create index if not exists order_change_requests_status_idx on public.order_change_requests(status);
create index if not exists order_change_requests_customer_idx on public.order_change_requests(customer_id);

alter table public.order_change_requests enable row level security;

-- Customers may read their own rows (status cards on the order page).
create policy "customers read own change requests" on public.order_change_requests
  for select using (customer_id = auth.uid());
```

No insert/update policies: submission and review both run through the
service-role client (the `changes` diff needs server-side validation that a
raw RLS insert can't enforce) — the same boundary the reviews feature uses.
A rejected request is kept for audit (unlike reviews, change requests carry
payment history: `delta_minor`, review trail).

**Status machine:**
- `pending` → `approved` (admin approved, but a `delta > 0` payment is still
  owed — the change has *not* been applied yet) → `applied` (webhook
  confirmed the delta payment, or the delta was ≤ 0 and applied at approval).
- `pending` → `applied` (instant tier, or admin approval with `delta ≤ 0`).
- `pending`/`approved` → `rejected` (admin; closing an unpaid delta also
  emails the customer).

**`changes` shape (jsonb):**

```ts
type ChangeRequestDiff = {
  delivery_date?: string;      // ISO date 'YYYY-MM-DD'
  delivery_window?: string;    // e.g. '17:00-19:00'
  recipient_name?: string;
  recipient_phone?: string;
  delivery_address?: string;   // same city only (city is not changeable)
  items?: {                   // quantity and/or gift_message edits only
    id: string;               // order_items.id
    quantity?: number;        // int ≥ 1
    gift_message?: string;    // '' clears the message
  }[];
};
```

An empty diff (no fields set) is invalid. `gift_message` is item-level
because it lives on `order_items`, not `orders`.

## Pure logic — `features/orders/change-request.ts` (tested)

- `canRequestChange({ fulfillmentStatus, paymentStatus, hasPendingRequest })`
  → `'ok' | 'not_found' | 'not_changeable' | 'request_pending'` — mirrors
  `canRequestCancellation`; `not_changeable` when fulfilment is `cancelled`
  or `delivered`, or payment is `refunded`.
- Cross-feature guard at submit: a **pending cancellation** for the same
  order also blocks a new change request (you can't change an order you're
  trying to cancel) — the submit route checks both `order_change_requests`
  and `order_cancel_requests` for a `pending` row. (Cancellation
  eligibility itself is untouched.)
- `requiresReview({ fulfillmentStatus, paymentStatus })` — **identical rule
  to cancellations**: `paymentStatus === 'paid' || fulfillmentStatus !== 'confirmed'`.
- `parseChangeRequestDiff(value)` → validated `ChangeRequestDiff` or
  `{ error }`: rejects unknown keys, non-ISO dates, empty strings, unknown
  item ids (checked later against the order's items), quantities < 1 or
  non-integer.
- `applyChanges(order, items, diff)` → pure function returning
  `{ ok: true, updated: { fields, items }, subtotalMinor, totalMinor, deltaMinor }`
  or `{ ok: false, reason }`:
  - Applies field diffs; unknown `items[].id` → error.
  - Recomputes `subtotal_minor = Σ order_items.unit_price_minor × quantity`
    over the (possibly edited) line items.
  - `total_minor = subtotal_minor + delivery_fee_minor − discount_minor`
    (both fixed); `delta_minor = new total − old total`.
  - No mutation of the input; returns the full updated shape so callers
    (service, admin route) can persist it.

## Money flow

Only `paid` orders ever touch Paymob. Let `delta = applyChanges(...).deltaMinor`:

| Case | Path |
|------|------|
| `delta > 0`, paid order | Admin approves → request `approved` (delta stored on the row, **change not yet applied**), customer emailed a "pay the difference" link to the order page. The order page's **Pay difference** button hits `POST /api/account/change-requests/[id]/pay`, which creates a fresh Paymob intention for `delta` with `special_reference = 'change:{requestId}'` and returns the checkout URL. The webhook, on a transaction whose `special_reference` starts with `change:`, records the payment and **applies** the change → `applied`. |
| `delta < 0`, paid order | **Refund-first block-approval** (exactly the cancellation pattern): find the order's `paid` payment, `refundPaymobTransaction({ transactionId: provider_reference, amountMinor: delta })`; on any refund problem the request stays `pending` and the admin sees a retryable error. On success, insert a `payments` row `{ order_id, amount_minor: delta, status: 'refunded', idempotency_key: 'change-refund:{requestId}', provider_reference: refundTransactionId, raw_event: {...} }` (the original payment row stays `paid` — it covered the original total), then apply → `applied`. |
| `delta = 0`, paid order | Apply immediately at approval → `applied`. |
| any delta, unpaid order | No money calls ever. Instant tier applies immediately at submit (new total is what's due at checkout); review tier applies at approval. |

## Two tiers

- **Instant** (`!requiresReview` — `confirmed` + not `paid`): submit → diff
  validated → `applyChanges` → order updated (fields + items + totals),
  request row inserted as `applied` with `delta_minor`, `order_events`
  (`change_applied`), email `change_approved`.
- **Review** (`requiresReview`): submit → request inserted `pending`,
  `order_events` (`change_requested`). Admin acts in `/admin/change-requests`.

## API

`POST /api/account/orders/[id]/change-request`
- Auth: `getCurrentCustomer()` → 401 when absent.
- Body: `{ changes, reason? }` — `parseChangeRequestDiff` → 400 on invalid.
- Load the order (own, service-role) → 404; `canRequestChange` → 409.
- Instant tier → apply + insert `applied` row → 200 `{ applied: true, deltaMinor }`.
- Review tier → insert `pending` row → 201 `{ requestId }`. No email (the
  admin queue is the notification, as with cancellations).

`POST /api/account/change-requests/[id]/pay`
- Auth: `getCurrentCustomer()` → 401; request must be their own and
  `status = 'approved'` → 409 otherwise.
- Creates a fresh Paymob intention (`createPaymobIntention` with
  `orderReference = 'change:{requestId}'`, `amountMinor = delta_minor`) and
  returns `{ checkoutUrl }` → 200. Regenerating on demand avoids storing
  expiring Paymob URLs on the row.

`POST /api/admin/change-requests/[id]` (service-role, `getCurrentAdmin` → 403)
- Body: `{ action: 'approve' | 'reject', reason? }`; unknown action → 400.
- **Reject**: allowed from `pending` (and `approved`, closing an unpaid
  delta) → `rejected`, `reviewed_by`/`reviewed_at` set, `admin_audit_logs`
  entry, email `change_rejected` → 200.
- **Approve**: re-validate status `pending`; re-run `applyChanges` against
  the current order snapshot (the diff is never trusted as stored) — an
  invalid diff (e.g. an item was since removed) → 409 `not_applicable`.
  Then the money table above: `delta > 0` → `approved` + email
  `change_payment_required` (link to the order page); `delta < 0` →
  refund-first, failure → 502 `refund_failed` (request stays `pending`);
  otherwise apply → `applied` + email `change_approved`.
- **Apply** = update `orders` (changed fields + `total_minor`/`subtotal_minor`
  + `updated_at`), update the affected `order_items` rows (quantity /
  gift_message), insert `order_events` (`change_applied`), set request
  `applied` with `delta_minor` + review fields, `admin_audit_logs`.

## Webhook — `app/api/webhooks/paymob/route.ts`

New branch, after HMAC verification and the existing refund-callback guard:

- Read `special_reference` in addition to `merchant_order_id`:
  `const special = String(transaction.order?.special_reference ?? '')`.
- If `special.startsWith('change:')` → change-request payment:
  - Look up `order_change_requests` by id (the suffix) → not found → still
    respond `{ received: true }` (never fail the webhook on a stale ref).
  - Idempotency: if already `applied`, respond `received: true` (a
    duplicate callback must not double-apply or double-charge).
  - Only proceed when `status = 'approved'` (the delta the customer just
    paid).
  - Insert `payments` row `{ order_id, amount_minor: delta_minor,
    status: 'paid', idempotency_key: 'change-pay:{transaction.id}',
    provider_reference: transaction.id, raw_event: transaction }` (mirrors
    the order-paid branch's insert shape).
  - Apply the change (same apply step as the admin route) → `applied`,
    `order_events`, email `change_approved`.

## Emails — `features/notifications/`

`NotificationType` union gains `change_approved`, `change_payment_required`,
`change_rejected`; templates (EN/AR/FR subject lines) and the retry list gain
the same three. Rendered body reuses the existing order-email template
(`renderOrderEmail`) with the order's totals — the delta amount is in the
subject/body copy where sensible. Delivery is best-effort via the existing
`deliverOrderNotification` + retry machinery.

## Admin — `/admin/change-requests`

Mirrors the cancel-requests queue (and reviews queue):

- Tabs **Active / Resolved** with counts, server-side: the active tab is
  `status in ('pending', 'approved')` — everything actionable — and the
  resolved tab (`?status=resolved`) is `status in ('applied', 'rejected')`.
- Active rows: order link, customer (email + name), requested date, a
  **change summary** (human-readable diff: "New date: Aug 20, 17:00–19:00 ·
  Qty ×2 → ×3" etc.), a **delta preview** (`old total → new total`, "+120
  EGP" / "−60 EGP" / "no change" — computed by running `applyChanges` on the
  current snapshot), and inline **Approve** / **Reject** actions.
  - Rows in `approved` (awaiting the customer's delta payment) get an
    "awaiting payment" badge; reject still closes them.
- Resolved rows: `applied` / `rejected` with reviewer name + review
  timestamp (dual-query profile join, as with cancel requests).
- `AutoRefresh` mounted; sidebar entry `{ href: '/admin/change-requests',
  key: 'changeRequests' }`; page + route `getCurrentAdmin`-gated.

## Account UI

On the order detail page (the token-based `/orders/[id]` page that already
hosts the cancellation request UI):

- **Request changes** form (client component `ChangeRequestForm`): delivery
  date, delivery window, recipient name/phone, delivery address, and a
  per-line-item quantity stepper + gift-message field. Submits to the
  account route; on 201/200 shows the appropriate notice.
- **Status cards** for any existing request: `pending` ("waiting for
  review"), `approved` ("approved — pay the difference" + **Pay difference**
  button that fetches a fresh checkout URL and opens it), `applied`
  ("change applied"), `rejected` ("change declined").
- Gate: no pending request and order eligible (`canRequestChange`) → form
  visible; otherwise notices mirror the cancellation UI.

## i18n keys (EN / AR / FR)

`changeRequests` ('Change requests'), `requestChange` ('Request a change'),
`changeDate`/`changeWindow`/`changeRecipient`/`changeAddress`/
`changeGiftMessage`/`changeQuantity` (form field labels), `changeSubmitted`
('Change requested — we'll review it shortly.'), `changeApplied`
('Change applied'), `changeApproved` ('Approved'), `changeRejected`
('Declined'), `changePending` ('Waiting for review'), `payDifference`
('Pay the difference'), `changeDelta` ('{delta} from {old} to {new}'),
`noChangeRequests` ('No change requests.'), `noPendingChangeRequests`
('No change requests waiting for review.'). Reuses existing `review`,
`decision`, `reviewedBy`, `approve`, `reject` keys where the copy fits.

## Out of scope

- Adding/removing product types, variant switches, delivery-city changes.
- Inventory re-check when quantities increase.
- Customer edits/cancels their own request after submission.
- Partial-payment edge cases (e.g. a second delta while one is unpaid — the
  `request_pending` eligibility guard prevents concurrent requests).
- Automatic retry of failed delta refunds (admin retries via the queue).

## Tests

- `tests/domain/change-request.test.ts` — `canRequestChange` (all branches),
  `requiresReview` (same tier table as cancellations), `parseChangeRequestDiff`
  (valid diff, empty diff, bad types, bad quantity).
- `tests/domain/apply-changes.test.ts` — the money math: field-only diff
  (delta 0), quantity up (delta > 0, computed from stored `unit_price_minor`),
  quantity down (delta < 0), gift message edit, unknown item id, invalid
  quantity, fee/discount fixed.
- `tests/domain/change-request-service.test.ts` (fakes for client, refund,
  intention, deliver) — instant apply path, review insert path, approve with
  delta < 0 (refund ok / refund fails → stays `pending`), delta = 0 applies,
  delta > 0 → `approved` + intention created + `change_payment_required`
  email, reject path (pending and approved), webhook apply path incl.
  idempotency (duplicate callback is a no-op) and unknown reference.
- `tests/components/ChangeRequestForm.test.tsx` — renders the form fields,
  posts the changes, shows pending/applied/rejected/approved+pay states.
- Full gate: `npm test`, `npm run lint`, `npm run build`.

## Phases

1. Migration `011` + pure `change-request.ts` (eligibility, tier, diff
   parsing) — TDD.
2. `applyChanges` money math — TDD.
3. Service + account submit route + admin review route + pay route — TDD
   with fakes.
4. Webhook `change:` branch + notification types/templates — TDD.
5. i18n keys + account UI (`ChangeRequestForm` + status cards + pay button).
6. Admin `/admin/change-requests` queue + sidebar + `AutoRefresh`.
7. Full gate, final review, merge (SDD with isolated worktree, as with
   reviews).
