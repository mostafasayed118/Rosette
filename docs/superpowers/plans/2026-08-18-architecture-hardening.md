# Architecture & Clean-Code Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove repeated error-handling/mapping boilerplate from API routes, wire the already-tested `selectDataSource` provider helper into both repositories, rename the misleading demo repositories, and delete dead code — with no behavior change.

**Architecture:** A new `lib/api.ts` holds `logRouteError(scope, error)` and `respond(result, cases, okBody?, okStatus?)`, applied to the 3 admin mutation routes and the 4 error catch blocks. `selectDataSource` becomes live in the order/catalog providers. The demo `repository.ts` files are renamed `local-repository.ts` for clarity. `db-types.ts` and the `CartSummary` re-export are removed.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-08-18-architecture-hardening-design.md`

## Global Constraints

- No new dependencies.
- No behavior changes: same status codes, same error messages, same payloads, same validation.
- No data-model, migration, or `package.json` changes.
- TDD: write the failing test first, confirm red, implement, confirm green, commit per task.
- Baseline test count: 191. Expected final: 196 (5 new).
- Use `git mv` for renames so history is preserved.

---

### Task 1: Shared API helpers (`lib/api.ts`)

**Files:**
- Create: `lib/api.ts`
- Test: `tests/lib/api.test.ts`

**Interfaces:**
- Produces: `logRouteError(scope: string, error: unknown): void` and `respond<T extends string>(result: T, cases: Partial<Record<T, { status: number; error: string }>>, okBody?: unknown, okStatus?: number): NextResponse`. Consumed by the routes in Tasks 2 and 3.

- [ ] **Step 1: Write the failing test**

Create `tests/lib/api.test.ts`:

```ts
import { describe, expect, it, vi, afterEach } from 'vitest';
import { logRouteError, respond } from '@/lib/api';

afterEach(() => vi.restoreAllMocks());

describe('respond', () => {
  it('maps a matching case to its status and error body', async () => {
    const res = respond('forbidden' as const, { forbidden: { status: 403, error: 'Forbidden' } });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden' });
  });

  it('falls through to the ok body when the result has no case', async () => {
    const res = respond('saved' as const, { forbidden: { status: 403, error: 'Forbidden' } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('honors a custom okStatus and non-default ok body', async () => {
    const res = respond('created' as const, {}, { ok: true, id: '1' }, 201);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true, id: '1' });
  });
});

describe('logRouteError', () => {
  it('logs the scope and the error message for Error instances', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logRouteError('order creation', new Error('boom'));
    expect(spy).toHaveBeenCalledWith('order creation error', 'boom');
  });

  it('logs "unknown" for non-Error throwables', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logRouteError('order creation', 'nope');
    expect(spy).toHaveBeenCalledWith('order creation error', 'unknown');
  });
});
```

- [ ] **Step 2: Confirm red** — `npx vitest run tests/lib/api.test.ts` fails (module not found).

- [ ] **Step 3: Implement**

Create `lib/api.ts`:

```ts
import { NextResponse } from 'next/server';

export function logRouteError(scope: string, error: unknown): void {
  console.error(`${scope} error`, error instanceof Error ? error.message : 'unknown');
}

export function respond<T extends string>(
  result: T,
  cases: Partial<Record<T, { status: number; error: string }>>,
  okBody: unknown = { ok: true },
  okStatus = 200,
): NextResponse {
  const hit = cases[result];
  if (hit) return NextResponse.json({ error: hit.error }, { status: hit.status });
  return NextResponse.json(okBody, { status: okStatus });
}
```

- [ ] **Step 4: Confirm green** — `npx vitest run tests/lib/api.test.ts` passes (5/5).

- [ ] **Step 5: Commit** — `git add lib/api.ts tests/lib/api.test.ts && git commit -m "Add shared API route helpers (logRouteError, respond)"`.

---

### Task 2: Apply helpers to the 3 admin mutation routes + normalize naming

**Files:**
- Edit: `app/api/admin/delivery/route.ts`
- Edit: `app/api/admin/promos/route.ts`
- Edit: `app/api/admin/orders/[id]/status/route.ts`

- [ ] **Step 1: `app/api/admin/delivery/route.ts`**

- Rename `const identity = await getCurrentAdmin();` → `const admin = await getCurrentAdmin();` and update the two `identity` uses (authorization check + the two action calls).
- Add `import { respond } from '@/lib/api';`.
- Replace each `if (result === '…') return NextResponse.json({ error: '…' }, { status: … }); … return NextResponse.json({ ok: true });` block:

Update-rule block becomes:
```ts
const result = await saveDeliveryRule(getAdminSupabase(), admin, { cityCode, feeMinor, minimumOrderMinor, cutoffHour, active });
return respond(result, {
  forbidden: { status: 403, error: 'Forbidden' },
  validation: { status: 400, error: 'Invalid rule data' },
  failure: { status: 500, error: 'Could not save rule' },
});
```

Create-city block becomes:
```ts
const result = await createCityWithRule(getAdminSupabase(), admin, { code, nameEn, nameAr, sameDay, feeMinor, minimumOrderMinor, cutoffHour });
return respond(result, {
  forbidden: { status: 403, error: 'Forbidden' },
  validation: { status: 400, error: 'Invalid city data' },
  city_taken: { status: 409, error: 'City code already exists' },
  failure: { status: 500, error: 'Could not create city' },
}, { ok: true }, 201);
```

- [ ] **Step 2: `app/api/admin/promos/route.ts`**

- Rename `const identity = await getCurrentAdmin();` → `const admin = await getCurrentAdmin();` and update the three uses.
- Add `import { respond } from '@/lib/api';`.
- Update-promo block:
```ts
const result = await savePromoCode(getAdminSupabase(), admin, promo);
return respond(result, {
  forbidden: { status: 403, error: 'Forbidden' },
  validation: { status: 400, error: 'Invalid promo data' },
  failure: { status: 500, error: 'Could not save promo' },
});
```
- Create-promo block:
```ts
const result = await createPromoCode(getAdminSupabase(), admin, promo);
return respond(result, {
  forbidden: { status: 403, error: 'Forbidden' },
  validation: { status: 400, error: 'Invalid promo data' },
  code_taken: { status: 409, error: 'Code already exists' },
  failure: { status: 500, error: 'Could not create promo' },
}, { ok: true }, 201);
```

- [ ] **Step 3: `app/api/admin/orders/[id]/status/route.ts`**

- Add `import { respond } from '@/lib/api';`.
- Replace the trailing chain:
```ts
return respond(result, {
  missing_order: { status: 404, error: 'Order not found' },
  invalid_or_unauthorized: { status: 409, error: 'Invalid or unauthorized transition' },
  failure: { status: 500, error: 'Could not update order' },
}, { ok: true, status: body.status });
```

- [ ] **Step 4: Verify** — `npx tsc --noEmit` clean; `npx vitest run` stays green.

- [ ] **Step 5: Commit** — `git commit -am "Route admin mutations through the shared respond() helper"`.

---

### Task 3: Apply `logRouteError` to the 4 error catch blocks

**Files:**
- Edit: `app/api/orders/route.ts`
- Edit: `app/api/webhooks/paymob/route.ts`
- Edit: `app/api/payments/paymob/intention/route.ts`
- Edit: `features/chat/groq-assistant.ts`

- [ ] **Step 1: `app/api/orders/route.ts`** — add `import { logRouteError } from '@/lib/api';`, replace `console.error('Order creation error', error instanceof Error ? error.message : 'unknown');` with `logRouteError('order creation', error);`.

- [ ] **Step 2: `app/api/webhooks/paymob/route.ts`** — add the import, replace `console.error('Paymob webhook error', error instanceof Error ? error.message : 'unknown');` with `logRouteError('paymob webhook', error);`.

- [ ] **Step 3: `app/api/payments/paymob/intention/route.ts`** — add the import, replace `console.error('Paymob intention error', error instanceof Error ? error.message : 'unknown');` with `logRouteError('paymob intention', error);`.

- [ ] **Step 4: `features/chat/groq-assistant.ts`** — add `import { logRouteError } from '@/lib/api';`, replace `console.error('[chat] assistant error:', error);` with `logRouteError('chat', error);`.

- [ ] **Step 5: Verify** — `npx tsc --noEmit` clean; `npx vitest run` stays green.

- [ ] **Step 6: Commit** — `git commit -am "Route error catches through the shared logRouteError() helper"`.

---

### Task 4: Wire `selectDataSource` + rename demo repositories

**Files:**
- Edit: `features/order/provider.ts`
- Edit: `features/catalog/provider.ts`
- Rename: `features/order/repository.ts` → `features/order/local-repository.ts` (via `git mv`)
- Rename: `features/catalog/repository.ts` → `features/catalog/local-repository.ts` (via `git mv`)
- Update importers (6 files): `features/order/OrderPageContent.tsx`, `features/checkout/CheckoutForm.tsx`, `tests/domain/repository.test.ts`, `tests/routes/purchase-flow.test.tsx`

- [ ] **Step 1: `git mv` the demo repos**

```bash
git mv features/order/repository.ts features/order/local-repository.ts
git mv features/catalog/repository.ts features/catalog/local-repository.ts
```

- [ ] **Step 2: Wire `selectDataSource` in `features/order/provider.ts`**

- Add `import { selectDataSource } from '@/features/commerce/provider-selection';`.
- Replace the final function body:
```ts
export function getOrderRepository(): OrderRepository {
  const url = getOptionalServerEnv('NEXT_PUBLIC_SUPABASE_URL');
  const serviceKey = getOptionalServerEnv('SUPABASE_SERVICE_ROLE_KEY');
  return url && serviceKey ? supabaseOrderRepository : localOrderRepository;
}
```
with:
```ts
export function getOrderRepository(): OrderRepository {
  const url = getOptionalServerEnv('NEXT_PUBLIC_SUPABASE_URL');
  const serviceKey = getOptionalServerEnv('SUPABASE_SERVICE_ROLE_KEY');
  return selectDataSource({ url, key: serviceKey }) === 'supabase' ? supabaseOrderRepository : localOrderRepository;
}
```
- Update the two `from './repository'` imports (top-level `createLocalOrder` and the dynamic `await import('./repository')`) to `'./local-repository'`.

- [ ] **Step 3: Wire `selectDataSource` in `features/catalog/provider.ts`**

- Add `import { selectDataSource } from '@/features/commerce/provider-selection';`.
- Replace the final function body:
```ts
export function getCatalogRepository(): CatalogRepository {
  const url = getOptionalServerEnv('NEXT_PUBLIC_SUPABASE_URL');
  const key = getOptionalServerEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  return url && key ? supabaseCatalogRepository : localCatalogRepository;
}
```
with:
```ts
export function getCatalogRepository(): CatalogRepository {
  const url = getOptionalServerEnv('NEXT_PUBLIC_SUPABASE_URL');
  const key = getOptionalServerEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  return selectDataSource({ url, key }) === 'supabase' ? supabaseCatalogRepository : localCatalogRepository;
}
```
- Update `import { localCatalogRepository } from './repository';` → `'./local-repository'`.

- [ ] **Step 4: Update remaining importers to the new paths**

- `features/order/OrderPageContent.tsx` line 10: `import { getLocalOrder } from './repository';` → `from './local-repository'`.
- `features/checkout/CheckoutForm.tsx` line 19: `import { createLocalOrder } from '@/features/order/repository';` → `from '@/features/order/local-repository'`.
- `tests/domain/repository.test.ts` line 2: `import { createLocalOrder } from '@/features/order/repository';` → `from '@/features/order/local-repository'`.
- `tests/routes/purchase-flow.test.tsx` lines 2 & 4: `from '@/features/catalog/repository'` → `from '@/features/catalog/local-repository'`; `from '@/features/order/repository'` → `from '@/features/order/local-repository'`.

- [ ] **Step 5: Verify** — `npx tsc --noEmit` clean; `npx vitest run` stays green (the 2 existing `provider-selection` tests are unchanged).

- [ ] **Step 6: Commit** — `git commit -am "Wire selectDataSource into providers and rename demo repos to local-repository"`.

---

### Task 5: Delete dead code + fix the CartSummary re-export

**Files:**
- Delete: `features/commerce/db-types.ts`
- Edit: `features/cart/CartSummary.tsx`
- Edit: `features/cart/CartLineItem.tsx`
- Edit: `features/order/OrderPageContent.tsx`

- [ ] **Step 1: Delete `features/commerce/db-types.ts`** — `git rm features/commerce/db-types.ts` (zero references; the `MoneyMinor`/`OrderState`/`ProductRow` types are unused).

- [ ] **Step 2: Remove the re-export** — in `features/cart/CartSummary.tsx`, delete line 7 `export { formatMoney } from '@/features/money';` (keep line 4 `import { formatMoney } from '@/features/money';` for the component's own use).

- [ ] **Step 3: Fix `features/cart/CartLineItem.tsx`** — change line 3 `import { formatMoney } from './CartSummary';` → `import { formatMoney } from '@/features/money';`.

- [ ] **Step 4: Fix `features/order/OrderPageContent.tsx`** — change line 7 `import { CartSummary, formatMoney } from '@/features/cart/CartSummary';` into two imports:
```ts
import { CartSummary } from '@/features/cart/CartSummary';
import { formatMoney } from '@/features/money';
```

- [ ] **Step 5: Verify** — `npx tsc --noEmit` clean; `npx vitest run` stays green; `rg "db-types" .` and `rg "from ['\"]./CartSummary['\"]|from ['\"]./repository['\"]" .` return nothing (outside `docs/`).

- [ ] **Step 6: Commit** — `git commit -am "Remove dead db-types and CartSummary formatMoney re-export"`.

---

### Task 6: Final verification gate

- [ ] **Step 1:** `npx vitest run` — expect 196/196 green.
- [ ] **Step 2:** `npx tsc --noEmit` — clean.
- [ ] **Step 3:** `npm run build` — compiles.
- [ ] **Step 4:** `git diff --check` — no whitespace errors.
- [ ] **Step 5:** Secret scan (run the project's existing `tests/security/no-secrets.test.ts` or the usual `rg` secret patterns) — clean.
- [ ] **Step 6:** Whole-branch review — confirm only the intended files changed (no storefront/admin UI/data-model/`package.json` churn) and the `docs/` spec/plan are the only docs touched.
- [ ] **Step 7:** Record rulings in the SDD ledger (`.superpowers/sdd/`).
