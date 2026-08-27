# Flower Subscriptions — Design Spec

Date: 2026-08-27
Status: Approved (brainstorming complete, all sections reviewed in chat)

## Overview

Prepaid flower subscriptions: customers buy a bundle of N deliveries upfront (existing Paymob redirect checkout), deliveries are scheduled on a fixed cadence, and each delivery materializes as a normal order that flows through the existing fulfillment, tracking, and admin pipelines.

### Locked product decisions

| Decision | Choice |
|---|---|
| Billing model | Prepaid bundles (pay upfront for N deliveries; no auto-charge, ever) |
| Plan structure | Fixed, admin-defined plans linked to one product |
| Delivery controls | Skip / pause / resume / reschedule / cancel from the account dashboard |
| Recipient | Self or one fixed recipient per subscription |
| Account | Required to subscribe |
| Fulfillment | Each delivery materializes as a real order (cron) |
| Admin | Plan CRUD + subscriber list + 14-day timeline |
| Delivery fees | Included in bundle price (materialized orders carry fee 0) |
| Bundle end | Renewal nudge at 1 delivery remaining (single-use discount code) + completion email |
| Cancellation | Store credit for the un-materialized remainder, issued as a gift card |
| Schedule model | Full schedule generated upfront (Approach A) |

## 1. Data model

New migration `supabase/migrations/033_subscriptions.sql`.

### `subscription_plans`

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | gen_random_uuid() |
| slug | text unique | URL-safe identifier |
| name_en / name_ar / name_fr | text | required (en), defaults '' (ar/fr) |
| description_en / description_ar / description_fr | text | |
| product_id | uuid → products | the bouquet delivered |
| frequencies | text[] | subset of `weekly`, `biweekly`, `monthly`; check non-empty |
| bundle_prices | jsonb | `[{ "deliveries": 4, "price_minor": 120000 }, ...]`; deliveries unique, > 0; price_minor > 0 |
| active | boolean | default true |
| sort_order | integer | default 0 |
| created_at / updated_at | timestamptz | |

### `subscriptions`

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| customer_id | uuid → profiles | required (account mandatory) |
| plan_id | uuid → subscription_plans | |
| product_id | uuid → products | snapshot of plan product at purchase |
| status | text | `pending_payment` \| `active` \| `paused` \| `completed` \| `cancelled` |
| frequency | text | `weekly` \| `biweekly` \| `monthly` |
| bundle_size | integer | deliveries purchased |
| price_minor | integer | total paid for the bundle |
| locale | text | `en` \| `ar` \| `fr` (email language) |
| recipient_name / recipient_phone / delivery_address | text | recipient snapshot |
| delivery_city_code | text → cities(code) | |
| delivery_window | text | |
| gift_message | text | default '' |
| first_delivery_date | date | chosen at checkout |
| checkout_order_id | uuid → orders | the bundle purchase order |
| renewal_nudge_sent_at | timestamptz | nullable; guards one-shot nudge |
| renewal_promo_code | text | nullable; generated code |
| cancelled_at / completed_at | timestamptz | nullable |
| created_at / updated_at | timestamptz | |

### `subscription_deliveries`

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| subscription_id | uuid → subscriptions on delete cascade | |
| position | integer | 1..bundle_size |
| scheduled_date | date | |
| status | text | `scheduled` \| `ordered` \| `cancelled` |
| order_id | uuid → orders | nullable; set at materialization |
| created_at / updated_at | timestamptz | |
| unique | (subscription_id, position) | |

### `subscription_events`

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| subscription_id | uuid → subscriptions on delete cascade | |
| delivery_id | uuid → subscription_deliveries | nullable |
| actor | text | `customer` \| `admin` \| `system` |
| actor_id | uuid → profiles | nullable |
| event_type | text | `created`, `activated`, `materialized`, `rescheduled`, `skipped`, `paused`, `resumed`, `cancelled`, `completed`, `nudge_sent`, `credit_issued` |
| payload | jsonb | e.g. `{ "from": "2026-09-12", "to": "2026-09-19" }` |
| created_at | timestamptz | |

### Schema changes to existing tables

- `orders`: add nullable `subscription_id uuid → subscriptions` and `subscription_delivery_id uuid → subscription_deliveries`. Set on both bundle purchase orders and materialized delivery orders. Used to exclude materialized (total 0) orders from revenue counts and to link UIs.

### Money flow

- Bundle purchase = a normal order with one line item describing the plan (e.g. "The Classic — 4 deliveries, weekly"), paid via the existing Paymob redirect flow. Payment row lands in the existing `payments` table.
- Materialized delivery = an order with `total_minor = 0`, `subtotal_minor = 0`, `delivery_fee_minor = 0`, `discount_minor = 0`, `payment_status = 'paid'`, `fulfillment_status = 'confirmed'`, `subscription_id`/`subscription_delivery_id` set. Extends the proven zero-total path used by full-gift-card checkouts.
- Revenue reporting must exclude orders where `subscription_delivery_id IS NOT NULL` (money was booked at bundle purchase).

### Inventory

- Bundle purchase: no inventory reservation (nothing ships).
- Materialized delivery: reserves inventory like a normal order.

## 2. Purchase flow (storefront)

### Routes (under `[locale]/[city]`)

- `/subscriptions` — landing page: hero, "how it works" (3 steps), plans grid (active plans only, "from X EGP / 4 bouquets"), FAQ (skip/pause/cancel/credit policy), CTA per plan. SEO metadata in en/ar/fr.
- `/subscriptions/[slug]/checkout` — plan checkout: frequency selector (plan's allowed frequencies), bundle size selector with prices, recipient toggle (me / someone else → recipient fields), city + address (existing city/delivery-rule constraints), first delivery date picker (reuses checkout lead-time rules), delivery window, gift message, order summary (total + effective per-bouquet price).

### API

`POST /api/subscriptions` (authenticated only; 401 → client redirects to login):

1. Validate plan active, frequency allowed, bundle size offered, lead time, city serviceability.
2. One RPC creates the checkout order (pending, plan line item, no inventory reservation) + the `subscriptions` row (`pending_payment`) with the recipient snapshot.
3. Returns Paymob checkout URL exactly like today's `POST /api/orders`.
4. Payment methods: Paymob online only. No pay-on-delivery for prepaid bundles. Demo-card fallback when Paymob is unconfigured (matches existing dev behavior).

Promo codes and gift cards are accepted on the bundle purchase via the existing checkout machinery (this is how renewal discounts redeem).

### Activation

The existing Paymob webhook marks the order paid; it is extended to call an idempotent RPC when the order is a subscription purchase:

- Subscription `pending_payment` → `active`.
- Generates all `subscription_deliveries` rows: first date as chosen, then +7 days (weekly), +14 days (biweekly), or +1 month (monthly). Monthly recurrence anchors on the original day-of-month, each occurrence clamped independently to that month's last day (Jan 31 → Feb 28 → Mar 31). Weekly/biweekly preserve the weekday.
- Logs `activated` event.

Payment failure → subscription stays `pending_payment`; the cron expires it after 24h (cancels the unpaid checkout order, keeps the row for audit, schedule never generated). If webhook activation itself fails, payment acknowledgment still succeeds; a cron repair pass reconciles paid-but-not-activated subscriptions.

## 3. Delivery lifecycle & cron

`GET/POST /api/cron/subscriptions` — same bearer-secret pattern as existing jobs (`CRON_SECRET_SUBSCRIPTIONS` with shared `CRON_SECRET` fallback via `isCronAuthorizedForJob`). Runs daily; three independent passes:

### Pass 1 — Materialize

For `active` subscriptions only (never `paused`): deliveries with status `scheduled` and `scheduled_date <= today + 2 days` (materialization horizon, matching order lead time; overdue dates included so a missed run catches up). Each delivery materializes in its own transaction via atomic, idempotent RPC `materialize_subscription_delivery`:

- Creates the order: recipient snapshot from the subscription, product from the subscription snapshot, quantity 1, totals all 0, `payment_status = 'paid'`, `fulfillment_status = 'confirmed'`, locale from the subscription, `subscription_id`/`subscription_delivery_id` set.
- Reserves inventory.
- Flips delivery `scheduled` → `ordered`, links `order_id`, logs `materialized` event.

From materialization, the florist works the order through the existing admin order manager; the customer tracks it on the existing tracking page. Existing order change/cancel request flows apply.

If the linked product lacks stock at materialization, the order is still created (florist resolves via order manager, as with any order) and an internal notification flags the shortage.

### Pass 2 — Renewal nudge & completion

- `active` subscriptions with exactly 1 un-materialized delivery remaining and `renewal_nudge_sent_at IS NULL`: generate a unique single-use promo code (existing `promo_codes`; `type = 'percent'`, 10% off, `max_uses = 1`, expiry 60 days), store it on the subscription, email a renewal link (plans page + code) in the subscriber's locale, log `nudge_sent`.
- When the last delivery materializes: subscription → `completed`, `completed_at` set, one thank-you/renew email (no code), log `completed`.

### Pass 3 — Cleanup & repair

- Expire `pending_payment` subscriptions older than 24h (cancel their unpaid checkout order).
- Reconcile paid checkout orders whose subscriptions never activated (webhook failure recovery).

### Failure behavior

Each delivery materializes independently; a failure logs and retries on the next run (status guards prevent double ordering). Emails ride `runInBackground`/`ctx.waitUntil` and never block the job. Notification rows written through the existing `notification_deliveries` pattern, honoring email preferences.

## 4. Subscriber controls & account UI

### Account dashboard — new "Subscriptions" tab

- **List:** plan name, status badge, progress ("2 of 4 delivered"), next delivery date, CTA (Manage / Renew when completed).
- **Detail:** recipient block, schedule list (per delivery: date, status — scheduled / ordered / delivered via linked order), controls.

### Controls

All server-side validated, all write `subscription_events`, all only affect `scheduled` deliveries (once `ordered`, the existing order change/cancel flow owns it):

- **Reschedule** — new date ≥ lead time; the chosen delivery and all later un-materialized deliveries shift by the same delta.
- **Skip** — pushes the chosen delivery + all later un-materialized deliveries back by one frequency interval. The bundle always delivers all N bouquets; the end date extends.
- **Pause / Resume** — pause freezes materialization. On resume the customer picks the next delivery date (≥ lead time); all remaining un-materialized deliveries re-space from that date at the chosen frequency.
- **Cancel** — confirmation step states: un-materialized deliveries are cancelled and their prepaid value becomes store credit; deliveries already materialized (next 2 days) still arrive.

### API (authenticated, scoped to owning customer)

```
GET  /api/account/subscriptions
GET  /api/account/subscriptions/[id]
POST /api/account/subscriptions/[id]/pause
POST /api/account/subscriptions/[id]/resume      { nextDeliveryDate }
POST /api/account/subscriptions/[id]/cancel
POST /api/account/subscriptions/[id]/deliveries/[deliveryId]/reschedule  { date }
POST /api/account/subscriptions/[id]/deliveries/[deliveryId]/skip
```

All date math (cadence generation, shifts, re-spacing, month-end clamping) lives in one pure, unit-tested module; RPCs apply its output — no date arithmetic in routes.

## 5. Cancellation credit & renewals

### Cancel → store credit

One atomic RPC `cancel_subscription`:

1. Subscription → `cancelled`; all `scheduled` deliveries → `cancelled`; events logged.
2. Credit = `price_minor × (unmaterialized_remaining ÷ bundle_size)`, rounded down. Materialized deliveries excluded.
3. Credit > 0 → issue a gift card via the existing gift-card system; `gift_card_purchases` source `subscription_refund`; code emailed. Credit never exceeds amount paid.
4. Confirmation email with credit + code. Zero credit → plain confirmation email.

Gift-card balances work everywhere normal gift cards do, including topping up a new subscription.

### Renewals

- Nudge at 1 delivery remaining: unique code, 10% off, `max_uses = 1`, 60-day expiry, validated by the existing promo engine at bundle checkout.
- Completion email when the last delivery materializes.
- New notification types registered in the existing notification/email-preferences machinery: `subscription_renewal_nudge`, `subscription_completed`, `subscription_cancelled_credit` (plus `subscription_activated`, `subscription_paused`, `subscription_resumed` confirmations).
- Completed subscriptions stay visible in the account with a **Renew** button → plans page (same plan preselected). Renewing is a fresh bundle purchase creating a new subscription. No auto-charge.

## 6. Admin

### `/admin/subscriptions`

- **Subscribers tab** — table: customer, plan, status, progress, next delivery date, created. Filters: status, plan. Row → detail: full schedule, events log, recipient, linked orders. Action: **cancel with store credit** (same RPC as customer cancel, audit-logged). No other admin schedule overrides in v1.
- **Timeline tab** — next 14 days of scheduled + ordered deliveries grouped by day (count, plan, customer, city, window). Ordered deliveries link to their orders.

### `/admin/subscriptions/plans`

List + create/edit pages (existing products CRUD style): names/descriptions en/ar/fr, linked product picker, allowed frequencies, bundle-size/price rows editor, active toggle, sort order. Deactivation hides the plan from the storefront; existing subscriptions are unaffected (price, bundle size, and product are snapshotted onto the subscription at purchase).

### API

`/api/admin/subscriptions` (list/detail/cancel), `/api/admin/subscriptions/plans` CRUD — behind existing admin auth + rate-limit guards; mutations audit-logged via `admin_audit_logs`.

### Dashboard overview

Two new tiles: active subscriptions count, deliveries this week.

## 7. Error handling & testing

### Error handling

- All mutation RPCs idempotent + transactional (delivery status guards; webhook activation guarded by `pending_payment`).
- Webhook extension is additive: activation failure never fails payment acknowledgment; cron repair pass reconciles.
- Cron passes independent; materialize failures retry next run; email failures best-effort via existing machinery.
- Checkout validates lead time, city serviceability, plan/frequency/bundle validity. Product out-of-stock at materialization → order created anyway, internal notification flags shortage.

### Testing (vitest + existing e2e config)

- Pure date-math module: cadence generation (weekly/biweekly/monthly incl. month-end clamping), skip/pause/resume shifts, edge dates.
- RPC/integration tests (existing Supabase test patterns): purchase → activation → schedule; materialization idempotency; cancel credit math.
- API route tests: auth scoping (customer A cannot touch B), validation errors.
- E2E smoke: plans page → checkout → demo-card → account management (skip/reschedule/pause).
- i18n: en/ar/fr strings complete; RTL verified on new pages.

## Out of scope (v1)

Per-delivery product swaps, per-delivery recipients, auto-charge/auto-renew, corporate/multi-address plans, subscription gifting to another account, delivery photos, loyalty points.

## Touched areas summary

- New migration `033_subscriptions.sql` (+ `orders` columns).
- New `features/subscriptions/` module (date math, repository, services, cron logic, UI components).
- Storefront routes: `[locale]/[city]/subscriptions`, `[locale]/[city]/subscriptions/[slug]/checkout`.
- Account dashboard: Subscriptions tab.
- Admin: `/admin/subscriptions` (+ plans CRUD), dashboard tiles.
- APIs: `/api/subscriptions`, `/api/account/subscriptions/*`, `/api/admin/subscriptions/*`, `/api/cron/subscriptions`.
- Extended: Paymob webhook (activation hook), notification templates/types, i18n dictionaries (en/ar/fr).
