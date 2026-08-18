# Admin Delivery Rules Editor — Design

**Date:** 2026-08-17
**Status:** Approved (brainstorm)
**Slice:** 3 of the admin cycle (order manager ✅ → catalog & inventory editor [PR #1] → **delivery rules editor** → dashboard overview)

## Goal

Let admins **and operators** view and edit per-city delivery rules — fee, minimum order, cutoff hour, active toggle — and add brand-new cities with their rule, all from `/admin/delivery` inline (no dedicated edit pages). Every change flows through a testable service behind one thin authorized route, consistent with the order-manager and catalog-editor patterns.

## Scope decisions (from brainstorm)

- **Roles:** admins and operators may both edit delivery rules and add cities.
- **City scope:** new cities can be added from the admin UI (creates a `cities` row + its `delivery_rules` row).
- **Editor shape:** inline row editing on `/admin/delivery` plus an "Add city" form at the top.

## Data model (existing, unchanged)

`cities`: `id`, `code` (unique), `name_en`, `name_ar`, `same_day`, `active`.

`delivery_rules`: `id`, `city_code` (FK → `cities.code`), `fee_minor` (≥ 0), `minimum_order_minor` (≥ 0), `cutoff_hour` (0–23), `active`.

Checkout consumes active rules only (`features/order/delivery-rules.ts` → `fetchDeliveryRule` filters `.eq('active', true)`), so deactivating a rule instantly reverts that city to the fallback fee — no other consumer changes needed.

## Section 1 — Page, forms, and route

### `/admin/delivery` (server component, admin-gated)

- Query: `cities` LEFT JOIN `delivery_rules` ordered by `cities.code`. All cities render even if they have no rule yet (those rows show the default fee and an inactive toggle).
- Row shows: city name (EN/AR), code, same-day badge, fee (EGP), minimum order (EGP), cutoff hour, active state.
- Page is English-only (admin persona).

### Client components

**`DeliveryRuleForm`** (per row, inline): fee (EGP), minimum order (EGP), cutoff hour (0–23 select), active toggle, Save button. Posts `{ action: 'update-rule', cityCode, feeMinor, minimumOrderMinor, cutoffHour, active }` to `/api/admin/delivery`. On success `router.refresh()`; inline error otherwise. Disabled while a request is in flight.

**`AddCityForm`** (top of page): code, name EN, name AR, same-day checkbox, fee (EGP), minimum order (EGP), cutoff hour select. Posts `{ action: 'create-city', code, nameEn, nameAr, sameDay, feeMinor, minimumOrderMinor, cutoffHour }`. On success `router.refresh()`; inline error otherwise (duplicate code shows a specific message).

### Route

`POST /api/admin/delivery` — one endpoint, body carries the action:
- Authorize via `getCurrentAdmin` (admin or operator)
- `update-rule` → 200; `create-city` → 201
- Validation failure → 400; duplicate city code → 409; service failure → 500; unknown action → 400

## Section 2 — Mutation service (`features/admin/delivery-actions.ts`)

Both functions take `(client, identity: AdminIdentity, input)` with a fake-able minimal client shape (`{ from: (table) => any }`), matching `features/admin/catalog-actions.ts`.

### `saveDeliveryRule`

Input: `{ cityCode, feeMinor, minimumOrderMinor, cutoffHour, active }`.

- Allowed for `admin` and `operator`; anything else → `'forbidden'`.
- Validation: fee and minimum are non-negative integers; cutoff is an integer 0–23 → else `'validation'`.
- Upserts the `delivery_rules` row keyed by `city_code` (update when a row exists for that city, insert when not).
- Audits `admin_audit_logs` with `update_delivery_rule`.
- Result: `'saved' | 'forbidden' | 'validation' | 'failure'`. DB error → `'failure'`.

### `createCityWithRule`

Input: `{ code, nameEn, nameAr, sameDay, feeMinor, minimumOrderMinor, cutoffHour }`.

- Allowed for `admin` and `operator`; anything else → `'forbidden'`.
- Validation: code matches `/^[a-z0-9]+(?:-[a-z0-9]+)*$/` (e.g. `greater-cairo`); EN/AR names non-empty; fee and minimum non-negative integers; cutoff integer 0–23 → else `'validation'`.
- Duplicate `cities.code` → `'city_taken'`, nothing written (checked before any insert).
- Inserts the `cities` row, then its `delivery_rules` row. If the rule insert fails, the city insert has already succeeded — the city remains visible (with no rule) and the action returns `'failure'`; this is safe because the left-join list renders rule-less cities.
- Audits `admin_audit_logs` with `create_city`.
- Result: `'created' | 'forbidden' | 'validation' | 'city_taken' | 'failure'`.

## Section 3 — Tests & verification

TDD in an isolated worktree off `master` (fakes only, no live services):

1. **`saveDeliveryRule`** — admin allowed, operator allowed, customer → `'forbidden'` (no writes); negative fee / cutoff 24 / fractional minimum → `'validation'` (no writes); success writes the rule (update path when a row exists, insert path when not) + audit.
2. **`createCityWithRule`** — success inserts city + rule + audit; duplicate code → `'city_taken'` (no writes); empty names / bad code / bad cutoff → `'validation'` (no writes).
3. Final gate: `npm test` (90 existing + new stay green), `tsc --noEmit`, `npm run build`, `git diff --check`, secret scan.

No new tables, no migration, no changes to customer-facing code (checkout already reads only active rules).
