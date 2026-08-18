# Promo / Discount Codes — Design

**Date:** 2026-08-18
**Status:** Approved (brainstorm)

## Goal

Admin-managed promo codes (percentage or fixed-amount discounts) that customers apply at checkout. The discount is validated and computed **server-side at order creation** — the client only ever supplies the code string; a public validation endpoint provides live preview feedback.

## Scope decisions (from brainstorm)

- **Discount types:** percentage and fixed amount; admin picks per code.
- **Limits:** max total uses (across all customers) + optional validity window (starts_at/expires_at). No per-customer tracking.
- **Minimum order:** optional per-code minimum subtotal; the code is rejected below it.
- **Admin surface:** new `/admin/promos` section — list with inline editor + add-code form (mirrors the delivery rules editor).
- **Approach:** migration + pure promo logic + thin routes + service layer (the established pattern).

## Section 1 — Migration + pure promo logic

**`supabase/migrations/002_promos.sql`** (follows `001_commerce.sql` conventions):

- `promo_codes`:
  - `id uuid pk default gen_random_uuid()`
  - `code text not null unique` (stored uppercase)
  - `type text not null check (type in ('percent', 'fixed'))`
  - `percent_off integer check (percent_off between 0 and 100)` (percent codes only)
  - `value_minor integer check (value_minor >= 0)` (fixed codes only)
  - `minimum_order_minor integer not null default 0 check (minimum_order_minor >= 0)`
  - `starts_at timestamptz` (nullable), `expires_at timestamptz` (nullable)
  - `max_uses integer not null default 0 check (max_uses >= 0)` (0 = unlimited)
  - `used_count integer not null default 0 check (used_count >= 0)`
  - `active boolean not null default true`
  - `created_at`, `updated_at`
  - RLS: enabled; public can select active codes (for the validate endpoint); writes admin-only.
- `orders` (alter): add `discount_minor integer not null default 0 check (discount_minor >= 0)` and `promo_code text` (nullable, no FK — preserved in order history).

**`features/promo/apply.ts`** (pure, testable, no I/O):

- `type PromoRow = { code: string; type: 'percent' | 'fixed'; percent_off: number | null; value_minor: number | null; minimum_order_minor: number; starts_at: string | null; expires_at: string | null; max_uses: number; used_count: number; active: boolean }`
- `validatePromo(promo: PromoRow, subtotalMinor: number, now: Date): string | null` — returns an error key or `null`:
  - `inactive` (not `active`)
  - `not_started` (`starts_at` in the future)
  - `expired` (`expires_at` in the past)
  - `max_uses` (`max_uses > 0 && used_count >= max_uses`)
  - `below_minimum` (`subtotalMinor < minimum_order_minor`)
- `computeDiscount(promo: PromoRow, subtotalMinor: number): { discountMinor: number; totalMinor: number }`:
  - percent → `discountMinor = Math.round(subtotalMinor * percent_off / 100)`
  - fixed → `discountMinor = Math.min(value_minor, subtotalMinor)`
  - `totalMinor = subtotalMinor - discountMinor` (never negative)

## Section 2 — Checkout integration

**Public validation endpoint** `GET /api/promo/validate?code=&subtotal=`:
- Looks up the code (service-role client); missing code → `{ valid: false, error: 'not_found' }`
- Runs `validatePromo`; invalid → `{ valid: false, error }`
- Valid → `{ valid: true, discountMinor, totalMinor }`

**Client hook** (`usePromoCode`, like `useDeliveryFee`): validates as the user types/confirms and exposes `{ state: 'idle' | 'valid' | 'invalid', discountMinor?, error? }`.

**Checkout UI:** a promo input next to the totals; on confirm shows either the discount line ("Discount −X EGP" in the summary) or a friendly error. The discount is **display-only** — the checkout body carries only `{ promoCode }`.

**Order creation (`features/order/`):**
- Checkout body gains optional `promoCode`.
- On create: fetch code → `validatePromo` (invalid → order rejected, 400) → `computeDiscount` → store `discount_minor` + `promo_code` on the order → increment `used_count` (only after the order insert succeeds; best-effort) → charge `total = subtotal + delivery − discount`.
- Order emails show the discount line when `discount_minor > 0`.

## Section 3 — Admin surface

**`/admin/promos`** (server page, admin-gated) — mirrors the delivery rules editor:
- List all codes: code, type, value (percent or EGP), minimum, validity window, uses (`used_count`/`max_uses`), active — inline edit form per row + "Add promo" form at top.
- **`features/admin/promo-actions.ts`**:
  - `savePromoCode(client, identity, input)` — admin/operator; validates; upserts by `code`; audits `update_promo`.
  - `createPromoCode(client, identity, input)` — admin/operator; same validation; duplicate code → `'code_taken'` (before any write); audits `create_promo`.
  - Validation: code matches `/^[A-Z0-9][A-Z0-9-]*$/` (uppercase, dashes); percent codes have `0 <= percent_off <= 100` and `value_minor` null; fixed codes have `value_minor >= 0` and `percent_off` null; `minimum_order_minor >= 0`; `max_uses >= 0`; `starts_at < expires_at` when both set.
- **`POST /api/admin/promos`** — `action: 'update-promo' | 'create-promo'` dispatch; 403/400/409/500/200/201 mapping (same shape as `/api/admin/delivery`).
- Admin nav + dashboard get a "Promos" link.

## Section 4 — Tests & verification

TDD in an isolated worktree off `master` (fakes only, no live services):

1. **`validatePromo`/`computeDiscount`** (pure): percent rounding, fixed capped at subtotal, and every error key (`inactive`, `not_started`, `expired`, `max_uses`, `below_minimum`); plus `not_found` handled by the lookup layer.
2. **Order creation with promo** (fake repository/client): stores `discount_minor` + `promo_code`; increments `used_count` only after success; rejects invalid/expired codes (400); total = subtotal + delivery − discount.
3. **`savePromoCode`/`createPromoCode`**: role checks (customer forbidden), validation rejections, upsert vs create, `code_taken`, audit rows written.
4. Migration reviewed against `001_commerce.sql` conventions (checks, RLS policies, idempotent `create table if not exists`).
5. Final gate: `npm test` (135 existing + new stay green), `tsc --noEmit`, `npm run build`, `git diff --check`, secret scan.
