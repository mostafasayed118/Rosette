# Multi-Recipient Cart — Design Spec

Date: 2026-08-27
Status: Approved (design review complete)

## Overview

Allow one checkout to serve multiple delivery recipients: a shopper buys
several bouquets in a single order, each going to a different person/address
on its own date. Today the cart is implicitly single-recipient — recipient
details exist only at checkout, and `orders` has one set of delivery columns.

## Approved Decisions

| Question | Decision |
|---|---|
| Shopper UX | Recipient groups managed in the cart |
| City scope | All groups in one order share the checkout city |
| Delivery fee | City flat fee charged per recipient group |
| Order structure | One order; per-group fulfillment status + tracking links (new `order_delivery_groups` table — "Approach A") |
| Change/cancel | Per-group cancel allowed; existing per-item change requests keep working |

## 1. Cart Model & UX

### Data model

`features/cart/types.ts`; storage key bumped `rosette.cart.v1` → `rosette.cart.v2`:

```ts
export type CartRecipient = {
  id: string;
  label?: string;            // e.g. "For Mom"; falls back to recipientName
  recipientName: string;
  recipientPhone: string;
  address: string;
  deliveryDate: string;
  deliveryWindow: string;
};

export type Cart = {
  version: 2;
  lines: CartLine[];         // CartLine gains: recipientId?: string
  recipients: CartRecipient[];
};
```

- Date/window live on the **recipient group**, not the line. A line's
  `deliveryDate` is synced from its group whenever it is assigned or moved
  (keeps abandoned-cart line validation and line-id semantics working).
- Backward compatible: carts with no `recipients` behave exactly as today —
  single-recipient checkout form, no behavior change.
- v1 carts migrate forward trivially: `{ version: 2, lines, recipients: [] }`.

### UX flow

1. Cart page gains a "Send to multiple recipients" action, which opens the
   recipient manager.
2. Recipient manager: create/edit groups (name, phone, address, date, window)
   via a dialog component; each group gets a friendly label.
3. Cart lines render grouped under their recipient card with a per-group
   subtotal; each line has a "move to group" control; lines without a group
   sit in an "Unassigned" section.
4. Per-group delivery fee (city flat fee) shown on each group card;
   total = items + (fee × group count).
5. Checkout is blocked until every line is assigned to a group and every
   group is complete.

Add-to-cart is unchanged: the product page still picks a delivery date;
group assignment happens in the cart, and the group's date wins.

## 2. Checkout Flow

Mode detection: cart has `recipients` → multi-recipient checkout; otherwise
the existing single-recipient form, untouched.

### Multi-recipient checkout layout

1. **Sender** — name + email (same fields as today).
2. **Recipient groups** — read-only summary cards: name, phone, address,
   date, window, group subtotal, group delivery fee. Each card's "Edit"
   opens the same recipient dialog component used in the cart (shared
   component, not duplicated).
3. **Payment & extras** — payment method, promo code, gift card: unchanged,
   applied at order level.

### Fees & rules

- Delivery fee = city flat fee (`delivery_rules.fee_minor`) × group count.
  The existing `GET /api/delivery-fee` preview endpoint gains an optional
  group-count parameter.
- Minimum-order check applies to the whole order subtotal (one city → one
  minimum, from `delivery_rules.minimum_order_minor`).
- Cutoff-hour validation (`delivery_rules.cutoff_hour`) runs per group: a
  group delivering today past cutoff is rejected.

### Validation

Server re-validates everything (client validation mirrors it):

- Sender fields as today.
- Every group: non-empty `recipientName`, valid phone (existing format
  rules), non-empty `address`, valid `deliveryDate`/`deliveryWindow`.
- Every cart line references an existing group.
- Group count ≤ 10.

### Payload

`POST /api/orders` gains a `recipients` array; each line carries its
`recipientId`. Rate limiting and Turnstile unchanged.

## 3. Database Schema & RPC

### Migration 033

```sql
create table order_delivery_groups (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
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

alter table order_items
  add column delivery_group_id uuid references order_delivery_groups(id);

alter table order_cancel_requests
  add column delivery_group_id uuid null;
```

The `fulfillment_status` domain mirrors `FulfillmentStatus` in
`features/commerce/order-state.ts`.

### Backward compatibility

- `orders.delivery_*` columns stay.
- Single-recipient orders create **no** group rows; the legacy write/read
  path stays byte-identical.
- Multi-recipient orders copy group #1 (position 0) into `orders.delivery_*`
  so existing admin-list and account queries keep showing meaningful data.
- One shared read helper normalizes both shapes for UI consumers:
  "groups if present, else order-level columns."

### `create_pending_order` RPC

Current signature
(`p_lines, p_destination, p_checkout, p_customer_id, p_subtotal_minor,
p_delivery_fee_minor, p_discount_minor, p_total_minor, p_promo_code,
p_gift_card_minor`) gains one optional parameter:

- `p_groups jsonb` — array of
  `{ recipientName, recipientPhone, deliveryAddress, deliveryDate,
  deliveryWindow, deliveryFeeMinor }`; each entry in `p_lines` gains a
  `groupIndex` referencing it.
- When `p_groups` is present: insert groups (generating each group's
  `public_token`), insert items with `delivery_group_id`, and populate
  `orders.delivery_*` from group #1. Everything — groups, items, inventory
  reservations, gift-card hold, promo usage — commits in the same single
  implicit transaction as today.
- When `p_groups` is null/empty: behavior is exactly as today
  (`delivery_group_id` null, no group rows).

### Per-group cancel

- Cancel request rows gain `delivery_group_id` (null = whole order, legacy).
- Approval of a group cancel: refund = group's items at list price + group's
  `delivery_fee_minor`; release that group's inventory reservations; set
  group `fulfillment_status = 'cancelled'` and `cancelled_at`.
- Order-level `fulfillment_status` is recomputed (see §4). All groups
  cancelled → order cancelled.
- Order-level discount (promo/gift card) is **not** prorated to groups.
  Refund guard: a group refund is capped so cumulative group refunds never
  exceed the cash actually paid (`order.total_minor − gift_card_minor`).
  When a cancellation leaves zero non-cancelled groups, it settles as a
  full-order cancel: refund the remaining cash paid and release/refund the
  gift card per the existing full-cancel rules (migration 021 guard).
- Reuses the existing cancel-request review flow and refund machinery.

### Change requests

- Per-item quantity and gift-message changes keep working
  (`apply_change_to_order` unchanged).
- Delivery-date changes via change request are **rejected for
  multi-recipient orders** (date is group-owned; handled by support).
  Single-recipient orders keep today's behavior.

## 4. Post-Purchase: Tracking, Admin, Emails

### Tracking page

- Order `public_token` → order summary plus one status card per group
  (recipient, date/window, items, fulfillment status).
- Each group card exposes its own shareable link built from the group's
  `public_token`; a group token resolves to the same page focused on that
  group. Sender gets the order-level link; per-recipient links can be
  forwarded to each recipient.
- For multi-recipient orders, `orders.fulfillment_status` is **derived**
  from group statuses: all groups cancelled → `cancelled`; all delivered →
  `delivered`; otherwise the in-progress state of the least-advanced
  non-cancelled group. Legacy orders unchanged.

### Admin order detail

- Multi-recipient orders render a Groups section: one card per group with
  recipient/address/date/window/fee, its items, and its own fulfillment
  status control.
- The admin status API gains an optional group id; updating a group
  recomputes the order-level derived status.
- Payment actions, the admin order list, and all other admin pages are
  unchanged.

### Account order history

Order detail shows the same read-only group breakdown as tracking.

### Emails

- Confirmation email lists every group (recipient, date/window, address).
- Status-change emails fire per group status change and name the group.
- No new email types.

## 5. Edge Cases

- **Abandoned-cart sync:** lines sync with `recipientId`, but the
  `recipients` list stays client-only (no recipient PII in DB carts). On
  restore, lines whose `recipientId` is unknown render as unassigned —
  items survive, recipients get re-entered.
- **Partial cancel with promo/gift card:** group refund = group items at
  list price + group delivery fee, capped so cumulative refunds never exceed
  the cash actually paid; order-level discount refunded only on full-order
  cancel (see §3 refund guard).
- **Payment:** one payment for the full total; per-group cancel triggers a
  partial refund through the existing refund machinery.
- **Limits:** max 10 recipient groups per cart; all groups share the
  checkout city — no city field in the recipient dialog.
- **i18n:** all new strings added to `en`, `ar`, `fr`; existing RTL layout
  covers the new UI.

## 6. Testing

Follows the repo's existing test setup:

- **Unit:** fee × group-count math; per-group checkout validation; derived
  order-status logic.
- **Integration:** `create_pending_order` with groups (group rows, item
  linkage, totals, atomicity); per-group cancel (refund amount, reservation
  release, derived status); legacy single-recipient path regression —
  behavior must be byte-identical.
- **E2E:** full multi-recipient journey (cart → groups → checkout →
  tracking with per-group links) plus a single-recipient smoke test.

## Out of Scope (v1)

- Recipients in different cities.
- Changing a group's delivery date post-purchase (support-handled).
- Per-recipient delivery notification emails (only the sender receives
  emails).
- Saved recipients / address book (separate roadmap item).
