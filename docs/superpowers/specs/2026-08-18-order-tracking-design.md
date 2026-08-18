# Customer Order Tracking Page — Design

**Date:** 2026-08-18
**Status:** Approved (brainstorm)

## Goal

A public `/track` page where a customer enters their order number + the email used at checkout and sees their order: status badges, delivery info, items with prices, totals, and a timeline of fulfillment status changes. Trilingual (EN/AR/FR) like the rest of the storefront.

## Scope decisions (from brainstorm)

- **Lookup key:** order `display_number` + `customer_email` — both required. Identical `null` for "wrong number" and "wrong email" so the endpoint can't be probed.
- **Detail level:** everything — statuses, delivery info, items (name, qty, unit price, add-ons), totals.
- **Page shape:** single `/track` page — GET form at top, results render below on the same page when `?number=` and `?email=` params are present (deep-linkable).
- **Approach:** server component + testable lookup service (no public JSON API, no RLS policy changes).

## Section 1 — Lookup service

**`features/tracking/lookup-order.ts`**:

- `lookupOrder(client, input: { number: string; email: string }): Promise<TrackedOrder | null>` with a fake-able client `{ from: (table: string) => any }` (matching the other services).
- Query: `orders` filtered by `.eq('display_number', number).eq('customer_email', email)`, embedding `order_items` and `order_events`, `.maybeSingle()`.
- Maps rows to a customer-safe `TrackedOrder`:
  - `number: string`, `paymentStatus: PaymentStatus`, `fulfillmentStatus: FulfillmentStatus`
  - `recipientName: string`, `deliveryCityCode: string`, `deliveryDate: string`, `deliveryWindow: string`
  - `subtotalMinor`, `deliveryFeeMinor`, `totalMinor` (numbers)
  - `items: Array<{ nameEn: string; nameAr: string; quantity: number; unitPriceMinor: number; addOns: Array<{ nameEn: string; nameAr: string; priceMinor: number }> }>`
  - `timeline: Array<{ status: FulfillmentStatus; at: string }>` — only `order_events` rows whose `to_status` is a fulfillment status, sorted ascending by `created_at`
- **Failure behavior (fail closed):** no row (wrong number or wrong email) → `null`; DB error or thrown exception → `null`. No error is ever surfaced to distinguish them.
- Types `PaymentStatus`/`FulfillmentStatus` from `@/features/commerce/order-state`.

## Section 2 — `/track` page

**`app/track/page.tsx` (server component, public, trilingual):**

- **Lookup form (top):** GET to `/track` with `number` + `email` fields. Labels and button come from new i18n dictionary keys (EN/AR/FR).
- **Results (when `?number=` and `?email=` are present):** run `lookupOrder` and render:
  - **Success — order card:** payment + fulfillment status badges; delivery info (city, date, window); items list (localized name, qty, unit price, add-ons); totals (subtotal, delivery, total); timeline of status changes with times.
  - **Not found — generic error:** one message ("We couldn't find an order with those details") plus a hint to check the confirmation email. Identical regardless of which field was wrong.
- Content picking uses `pickLocalized` (existing `features/i18n/pick.ts`) and the i18n dictionaries; money via the existing locale-aware `formatMoney` helper.
- **Nav:** add a "Track order" link (trilingual) to the storefront header/footer.

## Section 3 — Tests & verification

TDD in an isolated worktree off `master` (fakes only, no live services):

1. **`lookupOrder`** (fake Supabase client):
   - success → mapped shape: header fields, payment/fulfillment statuses, items with names/qty/unit price/add-ons, totals, timeline sorted ascending containing only fulfillment transitions
   - valid number + wrong email → `null`
   - unknown number → `null`
   - DB error → `null`
2. **Timeline mapping** — if extracted as a pure helper, test filtering (non-fulfillment events dropped), sorting, and mapping.
3. i18n dictionary test — new keys present in all three locales (follow the existing dictionary-completeness test pattern).
4. Final gate: `npm test` (121 existing + new stay green), `tsc --noEmit`, `npm run build`, `git diff --check`, secret scan.
