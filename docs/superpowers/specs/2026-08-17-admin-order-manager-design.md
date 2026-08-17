# Admin order manager — design

Date: 2026-08-17
Status: approved (design sections 1–3)
Scope: first slice of the admin cycle; fulfillment-only, payment read-only.

## Goal

Turn the thin read-only `/admin/orders` page into an operational order
manager: a searchable/filterable list, a full order detail page, role-aware
fulfillment status transitions, milestone emails, and one-click WhatsApp
contact — all reusing the existing authorization, audit, notification, and
order-state machinery.

## Non-goals (this slice)

- Payment-status actions (mark paid/refunded, inventory release on refund).
- Product/inventory/delivery-rule editors and the dashboard overview
  (later slices of the admin cycle).
- Bilingual admin UI — the admin area stays English-only.
- Pagination on the order list (volume is low; limit 100 newest first).

## Existing infrastructure reused

- `features/admin/authorization.ts` — `getCurrentAdmin`, `canUpdateOrderStatus`
  (operators cannot cancel; legal transitions from
  `features/commerce/order-state.ts`).
- `app/api/admin/orders/[id]/status/route.ts` — existing mutation endpoint
  (auth → validate → transition → `order_events` + `admin_audit_logs`).
- `features/notifications/notification-service.ts` — `sendOrderNotification`
  (bilingual, retryable failure), `isEmailConfigured`.
- `features/notifications/email-templates.ts` — templates already include
  `out_for_delivery` and `delivered`.
- `notification_deliveries` table — pending/sent/failed queue with attempts.
- `features/support/whatsapp.ts` — customer→business helper exists; an
  admin→customer helper is added.

## Routes & data (approved Section 1)

### `/admin/orders` — list (server component)

- Admin-gated (`getCurrentAdmin`; redirect `/login`).
- URL params: `q` (search), `payment` (payment status), `fulfillment`
  (fulfillment status).
- Query: `orders` select
  `id, display_number, customer_email, customer_phone, recipient_name,
   total_minor, payment_status, fulfillment_status, created_at`,
  order `created_at desc`, limit 100.
- Search: `or(display_number.ilike.%q%,customer_email.ilike.%q%,customer_phone.ilike.%q%)`
  when `q` is non-empty. Filters applied only when the value is a valid
  status. Invalid values are ignored (never 500).
- Query construction lives in a pure, testable helper
  (`buildOrderListQuery(params)` → constraints object).
- Filter controls: small client component (CatalogToolbar pattern) — text
  input + two selects submitting GET with the same params.
- Rows: display number (link to detail), recipient name, customer email,
  total, payment + fulfillment status badges.

### `/admin/orders/[id]` — detail (server component)

- Admin-gated; single query fetches:
  - Order: number, created_at, locale, payment/fulfillment status,
    subtotal/delivery/total, delivery city/date/window.
  - `order_items(*)`: name EN/AR, unit price, quantity, add-ons, gift message.
  - `payments`: provider, reference, amount, status.
  - `order_events` ascending: actor, from→to, created_at.
- Layout: header (number + statuses), recipient/customer block (names,
  email, phone, address, city, date, window), items table, payment card,
  timeline, actions footer.
- WhatsApp: `createAdminWhatsAppHref` →
  `https://wa.me/<digits of recipient phone>?text=…regarding order <number>…`
  (English); hidden when phone missing.
- Not found → "Order not found" + link back to the list.

## Mutation path (approved Section 2)

### `features/admin/order-actions.ts` — `updateFulfillmentStatus`

Extracted from the route body so it can be unit-tested with a fake Supabase
client. Signature takes injected client + input
(`{ admin, orderId, status }`). Steps:

1. Read order (`id, fulfillment_status, customer_email, locale`); 404 if
   missing.
2. `canUpdateOrderStatus(admin.role, from, to)`; reject with `invalid_or_unauthorized`
   if false.
3. Update `orders.fulfillment_status` + `updated_at`.
4. Insert `order_events` (`fulfillment_status_changed`, actor, from, to).
5. Insert `admin_audit_logs` (`update_order_status`, target order, metadata
   `{ status }`).
6. Milestone emails — only for `out_for_delivery` and `delivered`:
   insert `notification_deliveries` row (`type = 'out_for_delivery'` or
   `'delivered'` — the exact milestone, so a retry knows what to send;
   recipient = `customer_email`, locale = order locale, `status pending`), then
   best-effort `sendOrderNotification`; on failure mark the row `failed` and
   increment `attempts`. The transition result never depends on email
   success.

### Route

`POST /api/admin/orders/[id]/status` stays the only mutation and becomes a
thin shell: authorize, parse/validate status, delegate to the service,
respond. Error mapping: 403 no admin, 400 invalid status, 404 missing order,
409 illegal/unauthorized transition, 500 on unexpected failure.

### OrderActions UI (client)

Small component on the detail page. Renders only legal next states for the
current fulfillment status, respecting role restrictions; calls the API;
`router.refresh()` on success; inline error on failure; disabled while
in flight.

## Testing (approved Section 3)

TDD in the isolated worktree, fakes only (no live Supabase/Gmail/Paymob):

1. `updateFulfillmentStatus`:
   - success writes order + event + audit
   - illegal/unauthorized transition rejected, no writes
   - notification enqueued only for `out_for_delivery`/`delivered`
   - email failure → row `failed`, transition still succeeds
2. `buildOrderListQuery`: search maps to `ilike`; invalid filter values
   ignored.
3. `createAdminWhatsAppHref`: digits normalized, order text prefilled,
   `null` on missing phone.
4. Full gate before merge: `npm test`, `npm run lint` (tsc), `npm run build`,
   `git diff --check`.

## Security notes

- Every read is behind `getCurrentAdmin` (server-only, service role not
  exposed to the browser).
- Every write goes through the single authorized route; no client-supplied
  status bypasses `canUpdateOrderStatus`.
- No customer PII is logged beyond existing `order_events`/audit columns.
- WhatsApp link is built server-side from stored recipient phone; no user
  input enters the URL unvalidated.

## Deliverables

- `features/admin/order-actions.ts` (service + notification enqueue)
- `features/admin/order-list-query.ts` (pure query builder)
- `features/support/whatsapp.ts` — add `createAdminWhatsAppHref`
- `app/admin/orders/page.tsx` — list w/ search + filters
- `app/admin/orders/[id]/page.tsx` — detail
- `components/admin/OrderActions.tsx` — transition buttons
- `components/admin/OrderListToolbar.tsx` — filter form
- `app/api/admin/orders/[id]/status/route.ts` — thin shell over the service
- Tests: `tests/domain/order-actions.test.ts`,
  `tests/domain/order-list-query.test.ts`,
  `tests/domain/admin-whatsapp.test.ts`
