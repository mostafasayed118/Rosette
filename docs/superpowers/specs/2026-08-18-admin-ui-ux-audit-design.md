# Admin UI/UX + Responsive Audit — Design

Date: 2026-08-18
Status: Approved
Scope: Admin surface only (slice 2 of 3). Storefront audit is done; architecture hardening is a separate slice.

## Goal

Fix concrete admin UI/UX, accessibility, responsiveness, and consistency defects, plus an on-brand design-system polish (density + status semantics). No foreign palette and no backend/data-model changes.

## Non-goals

- No new dependencies (use existing shadcn components and brand tokens).
- No change to brand tokens/fonts (`globals.css` stays: rose/sage/cream, Fraunces + Inter/Cairo).
- No admin/API-route/data-model behavior changes (same fetches, validation, i18n keys).
- No storefront changes (slice 1) and no broad architecture refactor (slice 3).

## Findings being fixed

1. **Broken promos admin** — `app/admin/promos/page.tsx`, `PromoForm.tsx`, `AddPromoForm.tsx` still use retired legacy classes (`.eyebrow`, `.admin-table`, `.status-message`, `.checkout-form`, `.form-section`, `.form-grid`, `.field`, `.choice`, `.span-two`, `.button`, `.quantity-control`, `.field-error`) that no longer exist, so promos renders unstyled and inconsistent with the rest of the admin.
2. **Raw snake_case statuses** — orders list, order detail, and dashboard pipeline print `payment_started`/`ready_for_delivery` etc. directly instead of localized labels.
3. **Data-table overflow on mobile** — orders, products, inventory, and dashboard low-stock tables lack an `overflow-x-auto` wrapper.
4. **Duplicated money helpers** — `toMinor`/`minorToEgp` copy-pasted across 5 admin components.
5. **Raw inputs/selects** — `OrderListToolbar`, `ProductForm`, `DeliveryRuleForm`, `AddCityForm`, `SetQuantityForm` use hand-rolled `inputClass`/`selectClass`/`fieldLabelClass` instead of shadcn `Input`/`Select`/`Field`.
6. **Dashboard `egp()`** — local formatter instead of shared `formatMoney(minor, locale)`.
7. **Inventory raw id** — shows raw `variant_id` instead of the variant display name.
8. **Timeline locale** — hardcoded `en-GB` date formatting.
9. **AppSidebar** — missing `/admin/promos` icon.
10. **Design-system polish** — inconsistent stat cards, pipeline cards, table empty states, and badge color semantics.

## Section 1 — Status labels + badge semantics

### `features/admin/status-labels.ts` (pure, testable)

- `fulfillmentStatusKeys: Record<string, string>` — raw fulfillment status → i18n key (`statusConfirmed`, `statusPreparing`, `statusReadyForDelivery`, `statusOutForDelivery`, `statusDelivered`, `statusCancelled`).
- `paymentStatusKeys: Record<string, string>` — raw payment status → i18n key (`statusPending`, `statusPaymentStarted`, `statusPaid`, `statusPaymentFailed`, `statusCancelled`, `statusRefunded`).
- `fulfillmentBadgeVariant(status: string)` / `paymentBadgeVariant(status: string)` → Badge variant:
  - `success`: `paid`, `delivered`
  - `warning`: `refunded`
  - `destructive`: `payment_failed`, `cancelled`
  - `default`: `out_for_delivery`
  - `secondary`: `pending`, `payment_started`, `confirmed`, `preparing`, `ready_for_delivery` (and unknown → `secondary`)
- `fulfillmentLabel(status, t)` / `paymentLabel(status, t)` helpers return `t(key)` or the raw status as a fallback when unmapped.

### `components/ui/badge.tsx`

- Add `success` and `warning` variants using the existing `--color-success`/`--color-warning` tokens, with light/dark classes keeping text ≥ 4.5:1 contrast. Badges always pair a text label with color (never color alone).

### Apply to

- Orders list: payment + fulfillment columns use `paymentLabel`/`fulfillmentLabel` + the tone variant.
- Order detail: the status summary line and timeline use localized labels + tones.
- Dashboard pipeline cards: localized label + tone badge instead of raw `status`.

## Section 2 — Responsive tables & layout

- Wrap every admin data `<Table>` (orders, products, inventory, dashboard low-stock) in `<div className="overflow-x-auto">`.
- Verify the shadcn `SidebarProvider`/`SidebarTrigger` mobile drawer works (no change expected).
- `DeliveryRuleForm` row wraps on narrow screens (`flex-wrap`) so its inline fields don't overflow.
- Confirm form grids stack on mobile (existing `max-md:grid-cols-1`).

## Section 3 — Promos admin rewrite (shadcn)

- `app/admin/promos/page.tsx`: replace retired classes with `AdminShell` heading + a `Card`/`Table` list (code, type/value, minimum, uses, active badge).
- `PromoForm.tsx`: rebuild inline editor with shadcn `Input`/`Select`/`Button`/`Field`; remove `.quantity-control`/`.choice`/`.button`/`.field-error` and the unused `Button` import.
- `AddPromoForm.tsx`: rebuild add form with `Field`/`Input`/`Select`/`StatusMessage`; remove `.checkout-form`/`.form-section`/`.form-grid`/`.field`/`.choice`/`.span-two`.
- No behavior change (same fetch calls, validation, i18n keys).

## Section 4 — Consistency & clean code

- `features/admin/money.ts` — shared `toMinor(egp: string): number` and `minorToEgp(minor: number): string`; `ProductForm`, `DeliveryRuleForm`, `AddCityForm`, `PromoForm`, `AddPromoForm` import from it.
- Dashboard uses `formatMoney(minor, locale)` (pass `locale` from `getServerT`) instead of local `egp()`.
- `OrderListToolbar`, `ProductForm`, `DeliveryRuleForm`, `AddCityForm`, `SetQuantityForm` use shadcn `Input`/`Select`/`Field`; `OrderListToolbar`'s selects become controlled state (its `FormData` read is replaced).
- Inventory embeds `product_variants(name_en)` and shows the display name instead of `variant_id`.
- Order-detail timeline uses `toLocaleString(locale)` instead of `en-GB`.
- `AppSidebar` adds a `/admin/promos` icon (`Ticket` from lucide).

## Section 5 — Design-system polish (on-brand, dense)

- Stat cards: consistent equal height, icon + muted label + large value + link where relevant; tighter readable rhythm.
- Pipeline cards: localized label + tone badge + tone-tinted `Progress`.
- Tables: consistent row hover; status columns always use the Section 1 badge.
- Empty states use the shared `StatusMessage` (orders, products, inventory) instead of bare `<p>`.
- Confirm visible focus rings and `cursor-pointer` on interactive elements after consolidation.
- Keep `prefers-reduced-motion` and dark mode intact.

## Section 6 — Tests & verification

TDD in an isolated worktree, fakes only (no live services or browser):

1. `features/admin/status-labels.ts` — every raw status → correct i18n key and Badge variant; unknown → safe default.
2. `features/admin/money.ts` — `toMinor`/`minorToEgp` round-trip; `0`/empty/`"12.34"`/garbage inputs.
3. `Badge` — `success`/`warning` variants render their tone classes.
4. Full gate: `npm test` (179 existing + new) + `tsc --noEmit` + `npm run build` + `git diff --check` + secret scan before merge.
