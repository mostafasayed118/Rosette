# Admin Dashboard Overview — Design

**Date:** 2026-08-18
**Status:** Approved (brainstorm)
**Slice:** 4 (final) of the admin cycle — order manager ✅ → catalog & inventory editor ✅ (PR #1) → delivery rules editor ✅ → **dashboard overview**

## Goal

Replace the bare `/admin` hub (nav links + sign-out only) with a read-only operations dashboard: live stat cards (awaiting fulfillment, revenue today, revenue all-time), a per-status fulfillment pipeline, and an inline low-stock list — each linking into its admin page.

## Scope decisions (from brainstorm)

- **Metric set:** core trio + fulfillment pipeline.
- **"New orders" definition:** awaiting fulfillment — `payment_status = 'paid'` and `fulfillment_status` not in `delivered`/`cancelled`.
- **Low stock:** fixed threshold, available = `quantity − reserved_quantity` ≤ 3, list shown inline.
- **Approach:** server component + pure aggregation helper (no API route, no client state).

## Section 1 — Pure aggregation helper

**`features/admin/dashboard-stats.ts`** — no I/O, fully testable:

- `export const LOW_STOCK_THRESHOLD = 3`
- Input types matching the query rows:
  - `OrderRow = { payment_status: PaymentStatus; fulfillment_status: FulfillmentStatus; total_minor: number; created_at: string }`
  - `InventoryRow = { variant_name_en: string; quantity: number; reserved_quantity: number }`
- `computeDashboardStats(orders: OrderRow[], inventory: InventoryRow[], now: Date = new Date()): DashboardStats` where `DashboardStats` is:
  - `awaitingFulfillment: number` — `payment_status === 'paid'` and fulfillment not `delivered`/`cancelled`
  - `revenueTodayMinor: number` — sum of `total_minor` for paid orders whose `created_at` falls on `now`'s local date
  - `revenueAllTimeMinor: number` — sum of `total_minor` for all paid orders (unpaid and cancelled orders excluded)
  - `pipeline: Record<'confirmed' | 'preparing' | 'ready_for_delivery' | 'out_for_delivery' | 'delivered', number>` — per-status counts of paid orders; cancelled excluded entirely
  - `lowStock: Array<{ name: string; available: number }>` — inventory rows with `available ≤ 3`, sorted ascending by available, capped at 10 entries

Types `PaymentStatus`/`FulfillmentStatus` come from `features/commerce/order-state.ts`.

## Section 2 — Dashboard page

**`/admin` (server component, admin-gated)** — replaces the current hub:

- Queries via `getAdminSupabase`:
  - `orders`: `select('payment_status,fulfillment_status,total_minor,created_at')`
  - `inventory`: `select('quantity,reserved_quantity,product_variants(name_en)')` (variant names for the low-stock list)
- Passes rows through `computeDashboardStats` and renders:
  - **Stat cards** — Awaiting fulfillment (links to `/admin/orders`), Revenue today (EGP), Revenue all-time (EGP)
  - **Fulfillment pipeline** — one count per status, each linking to `/admin/orders?fulfillment=<status>` (the existing orders list already supports the `fulfillment` URL filter)
  - **Low stock list** — variant name + available count for each, plus a link to `/admin/inventory`
  - Existing nav links and sign-out preserved
- Admin UI is English-only; money shown as EGP (minor units ÷ 100, matching the existing admin pages).
- No new tables, no migrations, no API routes, no changes to customer-facing code.

## Section 3 — Tests & verification

TDD in an isolated worktree off `master` (fakes only, no live services):

1. **`computeDashboardStats`** (pure function tests):
   - awaiting-fulfillment counts only paid, non-delivered/non-cancelled orders
   - revenue today sums paid orders on `now`'s local date; revenue all-time sums all paid orders; unpaid/cancelled excluded from both
   - pipeline counts paid orders per status; cancelled excluded
   - low stock: available ≤ 3 only, sorted ascending by available, capped at 10, names carried through
   - `now` injectable for deterministic date boundaries
2. Final gate: `npm test` (107 existing + new stay green), `tsc --noEmit`, `npm run build`, `git diff --check`, secret scan.
