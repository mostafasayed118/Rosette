# Architecture & Clean-Code Hardening — Design

Date: 2026-08-18
Status: Approved
Scope: Cross-cutting architecture/clean-code hardening (slice 3 of 3). Storefront and admin audits are done.

## Goal

Remove repeated error-handling boilerplate, delete dead code, fix misleading imports/naming, and consolidate the provider fallback pattern — without changing any behavior.

## Non-goals

- No new dependencies.
- No behavior changes: same status codes, error messages, payloads, and data flow.
- No data-model or schema changes.
- No visual/UI changes.

## Findings being fixed

1. **Repeated result→response mapping** — 3 admin routes (`delivery`, `promos`, `orders/[id]/status`) each have a verbose `if (result === 'X') return NextResponse.json(...)` chain.
2. **Repeated error logging** — 3 API routes + `groq-assistant.ts` repeat `console.error('X error', error instanceof Error ? error.message : 'unknown')`.
3. **Dead code** — `features/commerce/db-types.ts` has zero references; `features/commerce/provider-selection.ts` (`selectDataSource`) is only referenced by its own test because the providers inlined the same decision.
4. **Misleading import** — `CartSummary.tsx` re-exports `formatMoney`; consumers import it from `./CartSummary` instead of `@/features/money`.
5. **Confusing naming** — the local demo repos are named `repository.ts` next to `supabase-repository.ts`; admin routes inconsistently name the current admin `identity` vs `admin`.

## Section 1 — Shared API helpers (`lib/api.ts`)

- `logRouteError(scope: string, error: unknown): void` — logs `console.error(\`${scope} error\`, error instanceof Error ? error.message : 'unknown')`.
- `respond<T extends string>(result: T, cases: Partial<Record<T, { status: number; error: string }>>, okBody?: unknown, okStatus?: number): NextResponse` — returns `NextResponse.json({ error }, { status })` for a mapped case, else `NextResponse.json(okBody, { status: okStatus })`.

## Section 2 — Apply helpers + normalize naming

- Replace the if-chains in `app/api/admin/delivery/route.ts`, `app/api/admin/promos/route.ts`, `app/api/admin/orders/[id]/status/route.ts` with `respond(result, cases, okBody, okStatus)`.
- Replace the repeated `console.error(...)` in `app/api/webhooks/paymob/route.ts`, `app/api/payments/paymob/intention/route.ts`, `app/api/orders/route.ts`, and `features/chat/groq-assistant.ts` with `logRouteError(scope, error)`.
- Rename `const identity = await getCurrentAdmin()` → `const admin = await getCurrentAdmin()` in the `delivery` and `promos` routes (and their call sites) to match the orders route and action-layer parameters.

## Section 3 — Provider consolidation + demo-repo rename

- Wire `selectDataSource` into `getCatalogRepository()` and `getOrderRepository()`, replacing the inline `url && key ? supabase : local` decision. The existing `selectDataSource` and its 2 tests stay.
- Rename `features/order/repository.ts` → `features/order/local-repository.ts` and `features/catalog/repository.ts` → `features/catalog/local-repository.ts`; update all importers (`order/provider.ts`, `OrderPageContent.tsx`, `catalog/provider.ts`, `CheckoutForm.tsx`, `tests/domain/repository.test.ts`, `tests/routes/purchase-flow.test.tsx`).

## Section 4 — Dead code + import hygiene

- Delete `features/commerce/db-types.ts` (no references, no test).
- `CartLineItem.tsx` and `OrderPageContent.tsx` import `formatMoney` from `@/features/money`; remove `export { formatMoney } from '@/features/money'` from `CartSummary.tsx`.

## Section 5 — Tests & verification

TDD in an isolated worktree (no live services):

1. `lib/api.ts` — `respond` maps each case to status/error and falls through to ok (custom `okStatus`, non-default `okBody`); `logRouteError` calls `console.error` with scope + message (spy).
2. `selectDataSource` — existing 2 tests unchanged.
3. Full gate: `npm test` (191 existing + ~5 new → 196) + `tsc --noEmit` + `npm run build` + `git diff --check` + secret scan before merge.
