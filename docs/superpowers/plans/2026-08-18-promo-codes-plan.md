# Promo / Discount Codes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin-managed promo codes (percent or fixed) that customers apply at checkout, with the discount validated and computed server-side at order creation.

**Architecture:** Migration `002_promos.sql` adds `promo_codes` + `orders.discount_minor`/`promo_code`; pure `validatePromo`/`computeDiscount`/`applyPromoToOrderTotals` in `features/promo/apply.ts` + `fetchPromo` in `features/promo/repository.ts`; a public `GET /api/promo/validate` endpoint powers live checkout feedback; order creation (`supabase-repository.ts`) enforces the discount; an `/admin/promos` section with service layer + thin route mirrors the delivery rules editor.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Supabase (postgrest-js), Vitest, `@/` path alias.

**Spec:** `docs/superpowers/specs/2026-08-18-promo-codes-design.md`

## Global Constraints

- TypeScript strict; `npm run lint` runs `tsc --noEmit` and must pass.
- Vitest for tests; new tests live in `tests/domain/*.test.ts`; `@/` resolves to repo root.
- Money is in minor units (piasters); display via `formatMoney(minor, locale)`.
- Trilingual: new UI strings go in all three locale dictionaries (`features/i18n/dictionaries.ts`); `tests/domain/i18n-dictionary.test.ts` enforces `ar`/`fr` ⊇ `en`.
- **The discount is server-side truth**: the client supplies only the promo code string; order creation validates and computes the discount. A forged request cannot discount an order.
- Promo codes are stored uppercase; validation uses `code.trim().toUpperCase()`.
- Percent codes have `percent_off` (0–100) and null `value_minor`; fixed codes have `value_minor >= 0` and null `percent_off`.
- Every admin save/creation writes an `admin_audit_logs` row.
- No secrets in code or tests; tests use fakes only, never live services.
- TDD: failing test → run (red) → implement → run (green) → commit.
- All 135 existing tests stay passing.

---

### Task 1: Migration and pure promo module

**Files:**
- Create: `supabase/migrations/002_promos.sql`
- Create: `features/promo/apply.ts`
- Create: `features/promo/repository.ts`
- Test: `tests/domain/promo-apply.test.ts`
- Test: `tests/domain/promo-repository.test.ts`

**Interfaces:**
- Consumes: nothing (pure module + SQL conventions from `001_commerce.sql`).
- Produces:
  - `supabase/migrations/002_promos.sql` — `promo_codes` table + `orders` columns + `increment_promo_usage` RPC (see Step 1).
  - `export type PromoRow = { code: string; type: 'percent' | 'fixed'; percent_off: number | null; value_minor: number | null; minimum_order_minor: number; starts_at: string | null; expires_at: string | null; max_uses: number; used_count: number; active: boolean }`
  - `validatePromo(promo: PromoRow, subtotalMinor: number, now: Date): 'inactive' | 'not_started' | 'expired' | 'max_uses' | 'below_minimum' | null`
  - `computeDiscount(promo: PromoRow, subtotalMinor: number): { discountMinor: number; totalMinor: number }`
  - `applyPromoToOrderTotals(totals: { subtotalMinor: number; deliveryFeeMinor: number }, promo: PromoRow): { subtotalMinor: number; deliveryFeeMinor: number; discountMinor: number; totalMinor: number }`
  - `fetchPromo(client: { from: (table: string) => any }, code: string): Promise<PromoRow | null>` — queries by `code = code.trim().toUpperCase()`, `null` on error/missing.

- [ ] **Step 1: Write the migration**

`supabase/migrations/002_promos.sql` (idempotent, same conventions as `001_commerce.sql`):

```sql
create table if not exists public.promo_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  type text not null check (type in ('percent', 'fixed')),
  percent_off integer check (percent_off between 0 and 100),
  value_minor integer check (value_minor >= 0),
  minimum_order_minor integer not null default 0 check (minimum_order_minor >= 0),
  starts_at timestamptz,
  expires_at timestamptz,
  max_uses integer not null default 0 check (max_uses >= 0),
  used_count integer not null default 0 check (used_count >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.orders add column if not exists discount_minor integer not null default 0 check (discount_minor >= 0);
alter table public.orders add column if not exists promo_code text;

create or replace function public.increment_promo_usage(p_code text)
returns void language sql security definer as $$
  update public.promo_codes set used_count = used_count + 1 where code = p_code;
$$;

alter table public.promo_codes enable row level security;
create policy "public can select active promo codes" on public.promo_codes for select using (active = true);
create policy "admins can manage promo codes" on public.promo_codes for all using (
  exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role in ('admin', 'operator'))
);
```

- [ ] **Step 2: Write the failing tests**

`tests/domain/promo-apply.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { validatePromo, computeDiscount, applyPromoToOrderTotals, type PromoRow } from '@/features/promo/apply';

const now = new Date('2026-08-18T12:00:00Z');
const percentPromo: PromoRow = { code: 'ROSE10', type: 'percent', percent_off: 10, value_minor: null, minimum_order_minor: 0, starts_at: null, expires_at: null, max_uses: 0, used_count: 0, active: true };
const fixedPromo: PromoRow = { code: 'EGP50', type: 'fixed', percent_off: null, value_minor: 5000, minimum_order_minor: 0, starts_at: null, expires_at: null, max_uses: 0, used_count: 0, active: true };

describe('validatePromo', () => {
  it('accepts a valid active promo', () => {
    expect(validatePromo(percentPromo, 10000, now)).toBeNull();
  });
  it('rejects inactive promos', () => {
    expect(validatePromo({ ...percentPromo, active: false }, 10000, now)).toBe('inactive');
  });
  it('rejects promos that have not started', () => {
    expect(validatePromo({ ...percentPromo, starts_at: '2026-08-19T00:00:00Z' }, 10000, now)).toBe('not_started');
  });
  it('rejects expired promos', () => {
    expect(validatePromo({ ...percentPromo, expires_at: '2026-08-17T00:00:00Z' }, 10000, now)).toBe('expired');
  });
  it('rejects promos at their usage cap', () => {
    expect(validatePromo({ ...percentPromo, max_uses: 5, used_count: 5 }, 10000, now)).toBe('max_uses');
    expect(validatePromo({ ...percentPromo, max_uses: 5, used_count: 4 }, 10000, now)).toBeNull();
    expect(validatePromo({ ...percentPromo, max_uses: 0, used_count: 99 }, 10000, now)).toBeNull();
  });
  it('rejects promos below the minimum order', () => {
    expect(validatePromo({ ...percentPromo, minimum_order_minor: 20000 }, 10000, now)).toBe('below_minimum');
  });
});

describe('computeDiscount', () => {
  it('rounds percent discounts', () => {
    expect(computeDiscount(percentPromo, 12345)).toEqual({ discountMinor: 1235, totalMinor: 11110 });
  });
  it('caps fixed discounts at the subtotal', () => {
    expect(computeDiscount(fixedPromo, 3000)).toEqual({ discountMinor: 3000, totalMinor: 0 });
    expect(computeDiscount(fixedPromo, 10000)).toEqual({ discountMinor: 5000, totalMinor: 5000 });
  });
  it('never discounts below zero even for huge percents', () => {
    expect(computeDiscount({ ...percentPromo, percent_off: 200 }, 10000)).toEqual({ discountMinor: 10000, totalMinor: 0 });
  });
});

describe('applyPromoToOrderTotals', () => {
  it('computes total as subtotal plus delivery minus discount', () => {
    expect(applyPromoToOrderTotals({ subtotalMinor: 10000, deliveryFeeMinor: 7500 }, percentPromo)).toEqual({ subtotalMinor: 10000, deliveryFeeMinor: 7500, discountMinor: 1000, totalMinor: 16500 });
  });
});
```

`tests/domain/promo-repository.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { fetchPromo } from '@/features/promo/repository';

type Call = { table: string; column: string; value: string };

function fakeClient(seed: { promo?: Record<string, unknown> | null; error?: boolean }) {
  const calls: Call[] = [];
  const from = (table: string) => ({
    select: () => ({
      eq: (column: string, value: string) => {
        calls.push({ table, column, value });
        return { maybeSingle: async () => (seed.error ? { data: null, error: { message: 'db down' } } : { data: seed.promo ?? null, error: null }) };
      },
    }),
  });
  return { client: { from }, calls };
}

describe('fetchPromo', () => {
  it('looks up by uppercase code and returns the row', async () => {
    const { client, calls } = fakeClient({ promo: { code: 'ROSE10', type: 'percent', percent_off: 10 } });
    const result = await fetchPromo(client, '  rose10 ');
    expect(calls).toEqual([{ table: 'promo_codes', column: 'code', value: 'ROSE10' }]);
    expect(result).toMatchObject({ code: 'ROSE10', type: 'percent', percent_off: 10 });
  });
  it('returns null when missing or on error', async () => {
    expect(await fetchPromo(fakeClient({ promo: null }).client, 'ROSE10')).toBeNull();
    expect(await fetchPromo(fakeClient({ promo: { code: 'X' }, error: true }).client, 'ROSE10')).toBeNull();
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -- tests/domain/promo-apply.test.ts tests/domain/promo-repository.test.ts`
Expected: FAIL — modules `@/features/promo/apply` and `@/features/promo/repository` not found.

- [ ] **Step 4: Implement**

`features/promo/apply.ts`:

```ts
export type PromoRow = {
  code: string;
  type: 'percent' | 'fixed';
  percent_off: number | null;
  value_minor: number | null;
  minimum_order_minor: number;
  starts_at: string | null;
  expires_at: string | null;
  max_uses: number;
  used_count: number;
  active: boolean;
};

export type PromoError = 'inactive' | 'not_started' | 'expired' | 'max_uses' | 'below_minimum';

export function validatePromo(promo: PromoRow, subtotalMinor: number, now: Date): PromoError | null {
  if (!promo.active) return 'inactive';
  if (promo.starts_at && new Date(promo.starts_at).getTime() > now.getTime()) return 'not_started';
  if (promo.expires_at && new Date(promo.expires_at).getTime() < now.getTime()) return 'expired';
  if (promo.max_uses > 0 && promo.used_count >= promo.max_uses) return 'max_uses';
  if (subtotalMinor < promo.minimum_order_minor) return 'below_minimum';
  return null;
}

export function computeDiscount(promo: PromoRow, subtotalMinor: number): { discountMinor: number; totalMinor: number } {
  const raw = promo.type === 'percent' ? Math.round((subtotalMinor * (promo.percent_off ?? 0)) / 100) : (promo.value_minor ?? 0);
  const discountMinor = Math.min(raw, subtotalMinor);
  return { discountMinor, totalMinor: subtotalMinor - discountMinor };
}

export function applyPromoToOrderTotals(totals: { subtotalMinor: number; deliveryFeeMinor: number }, promo: PromoRow) {
  const { discountMinor } = computeDiscount(promo, totals.subtotalMinor);
  return { ...totals, discountMinor, totalMinor: totals.subtotalMinor + totals.deliveryFeeMinor - discountMinor };
}
```

`features/promo/repository.ts`:

```ts
import type { PromoRow } from './apply';

type PromoClient = { from: (table: string) => any };

export async function fetchPromo(client: PromoClient, code: string): Promise<PromoRow | null> {
  const { data, error } = await client.from('promo_codes').select('*').eq('code', code.trim().toUpperCase()).maybeSingle();
  if (error || !data) return null;
  return data as PromoRow;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- tests/domain/promo-apply.test.ts tests/domain/promo-repository.test.ts`
Expected: PASS (12 tests — 10 apply + 2 repository).

- [ ] **Step 6: Run the full suite, then commit**

Run: `npm test`
Expected: 135 existing + 12 new = **147 passed**.

```bash
git add supabase/migrations/002_promos.sql features/promo/apply.ts features/promo/repository.ts tests/domain/promo-apply.test.ts tests/domain/promo-repository.test.ts
git commit -m "feat: add promo codes migration and pure promo logic"
```

---

### Task 2: Public validate endpoint, hook, and checkout UI

**Files:**
- Create: `app/api/promo/validate/route.ts`
- Create: `features/promo/usePromoCode.ts`
- Modify: `features/checkout/CheckoutForm.tsx` (promo input + discount line)
- Modify: `features/i18n/dictionaries.ts` (new keys in all three locales)

**Interfaces:**
- Consumes: `fetchPromo`, `validatePromo`, `computeDiscount` (Task 1); `useDeliveryFee` pattern from `features/delivery/useDeliveryFee.ts`.
- Produces:
  - `GET /api/promo/validate?code=&subtotal=` → `{ valid: true, discountMinor, totalMinor }` or `{ valid: false, error }` (`not_found` for missing).
  - `usePromoCode(subtotalMinor: number)` → `{ state: 'idle' | 'valid' | 'invalid', discountMinor: number | null, error: string | null, code: string, setCode: (code: string) => void, confirm: () => void }`.

- [ ] **Step 1: Create the validate route**

`app/api/promo/validate/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { computeDiscount, validatePromo } from '@/features/promo/apply';
import { fetchPromo } from '@/features/promo/repository';
import { getAdminSupabase } from '@/lib/supabase/admin';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code')?.trim();
  const subtotalRaw = url.searchParams.get('subtotal');
  const subtotal = subtotalRaw ? Number(subtotalRaw) : NaN;
  if (!code || !Number.isInteger(subtotal) || subtotal < 0) return NextResponse.json({ valid: false, error: 'not_found' }, { status: 400 });
  const promo = await fetchPromo(getAdminSupabase(), code);
  if (!promo) return NextResponse.json({ valid: false, error: 'not_found' });
  const promoError = validatePromo(promo, subtotal, new Date());
  if (promoError) return NextResponse.json({ valid: false, error: promoError });
  const { discountMinor, totalMinor } = computeDiscount(promo, subtotal);
  return NextResponse.json({ valid: true, discountMinor, totalMinor });
}
```

- [ ] **Step 2: Create the client hook**

`features/promo/usePromoCode.ts` (modeled on `useDeliveryFee`):

```ts
'use client';

import { useEffect, useState } from 'react';

export type PromoCodeState = { state: 'idle' | 'valid' | 'invalid'; discountMinor: number | null; error: string | null; code: string; setCode: (code: string) => void; confirm: () => void };

export function usePromoCode(subtotalMinor: number): PromoCodeState {
  const [code, setCode] = useState('');
  const [applied, setApplied] = useState<string | null>(null);
  const [discountMinor, setDiscountMinor] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    const trimmed = code.trim();
    if (!trimmed) { setApplied(null); setDiscountMinor(null); setError(null); return; }
    const response = await fetch(`/api/promo/validate?code=${encodeURIComponent(trimmed)}&subtotal=${subtotalMinor}`);
    const data = await response.json() as { valid?: boolean; discountMinor?: number; error?: string };
    if (!response.ok || !data.valid) { setApplied(null); setDiscountMinor(null); setError(data.error ?? 'not_found'); return; }
    setApplied(trimmed);
    setDiscountMinor(data.discountMinor ?? 0);
    setError(null);
  }

  return { state: applied ? 'valid' : error ? 'invalid' : 'idle', discountMinor, error, code, setCode, confirm };
}
```

- [ ] **Step 3: Add the dictionary keys**

In `features/i18n/dictionaries.ts`, append to all three locale objects (after `statusRefunded` in each):

- `promoCode: 'Promo code'` / `'رمز الخصم'` / `'Code promo'`
- `applyPromo: 'Apply'` / `'تطبيق'` / `'Appliquer'`
- `promoApplied: 'Discount applied'` / `'تم تطبيق الخصم'` / `'Remise appliquée'`
- `discount: 'Discount'` / `'الخصم'` / `'Remise'`
- `promoInvalid: 'That promo code is no longer valid.'` / `'رمز الخصم لم يعد صالحاً.'` / `'Ce code promo n’est plus valide.'`
- `promoNotFound: 'We couldn’t find that promo code.'` / `'لم نتمكن من العثور على رمز الخصم.'` / `'Nous n’avons pas trouvé ce code promo.'`
- `promoBelowMinimum: 'Add more items to use this code.'` / `'أضف المزيد من العناصر لاستخدام هذا الرمز.'` / `'Ajoutez plus d’articles pour utiliser ce code.'`

- [ ] **Step 4: Extend CheckoutInput, then wire the promo input into the checkout form**

First, in `features/checkout/types.ts`, change `CheckoutInput` to add the optional promo field (the form sends it in Task 2, so the type must exist here):

```ts
export type CheckoutInput = { recipientName: string; recipientPhone: string; address: string; senderName: string; senderEmail: string; deliveryDate: string; deliveryWindow: string; paymentMethod: PaymentMethod; promoCode?: string };
```

Then in `features/checkout/CheckoutForm.tsx`:

1. Import `usePromoCode` and add to `CheckoutInput`-adjacent state: `const promo = usePromoCode(calculateCartTotals(cart.lines, 0).subtotal);` (place after `useDeliveryFee`).
2. Compute the displayed total with the discount: after `const liveTotal = ...` add `const promoDiscount = promo.discountMinor ?? 0;` and change the submit button text from `formatMoney(liveTotal, locale)` to `formatMoney(Math.max(0, liveTotal - promoDiscount), locale)`.
3. Add the promo UI in the payment section, before the submit button:

```tsx
<label className="field"><span>{t('promoCode')}</span><div className="quantity-control"><input type="text" value={promo.code} onChange={(event) => promo.setCode(event.target.value)} aria-label={t('promoCode')} /><button className="button" type="button" onClick={promo.confirm}>{t('applyPromo')}</button></div>{promo.state === 'valid' ? <small className="field-error" style={{ color: 'inherit' }}>{t('promoApplied')} — {formatMoney(promo.discountMinor ?? 0, locale)}</small> : promo.error ? <small className="field-error">{promo.error === 'below_minimum' ? t('promoBelowMinimum') : promo.error === 'not_found' ? t('promoNotFound') : t('promoInvalid')}</small> : null}</label>
```

4. Send the code with the order: in the `paymob` branch of `submit`, add `promoCode: promo.state === 'valid' ? promo.code : undefined` to the body: `body: JSON.stringify({ cart, destination, checkout: { ...input, promoCode: promo.state === 'valid' ? promo.code.trim() : undefined }, locale })`. (The local demo branch ignores `promoCode` — demo mode has no promo table.)

- [ ] **Step 5: Verify typecheck, build, and dictionary test**

Run: `npm run lint && npm run build && npm test -- tests/domain/i18n-dictionary.test.ts`
Expected: all pass; `/api/promo/validate` appears in the build output.

- [ ] **Step 6: Commit**

```bash
git add app/api/promo/validate/route.ts features/promo/usePromoCode.ts features/checkout/CheckoutForm.tsx features/i18n/dictionaries.ts
git commit -m "feat: add promo code validation endpoint and checkout UI"
```

---

### Task 3: Server-side enforcement at order creation

**Files:**
- Modify: `features/order/types.ts` (add `'invalid_promo'` to `OrderCreateError`)
- Modify: `features/order/supabase-repository.ts` (createPending applies the promo)
- Modify: `app/api/orders/route.ts` (map `invalid_promo` → 400)
- Modify: `features/notifications/email-types.ts` (`OrderNotificationInput` gains `discountMinor?: number`)
- Modify: `features/notifications/email-templates.ts` (discount line in the email body)
- Modify: `tests/domain/email-templates.test.ts` (discount-line test)

**Interfaces:**
- Consumes: `fetchPromo`, `validatePromo`, `applyPromoToOrderTotals` (Task 1); `CheckoutInput.promoCode` (Task 2).
- Produces: order creation that stores `discount_minor` + `promo_code`, increments usage, and rejects invalid codes with `'invalid_promo'`.

- [ ] **Step 1: Extend the types**

In `features/order/types.ts`, change `OrderCreateError` to:

```ts
export type OrderCreateError = 'empty_cart' | 'unavailable' | 'invalid' | 'invalid_promo';
```

In `features/notifications/email-types.ts`, change `OrderNotificationInput` to add `discountMinor?: number`.

- [ ] **Step 2: Apply the promo in createPending**

In `features/order/supabase-repository.ts`, add imports at the top:

```ts
import { applyPromoToOrderTotals, validatePromo } from '@/features/promo/apply';
import { fetchPromo } from '@/features/promo/repository';
```

Then inside `createPending`, replace the `const totals = calculateCartTotals(safeLines, feeMinor);` line (and the order insert) with:

```ts
let totals = calculateCartTotals(safeLines, feeMinor);
let discountMinor = 0;
let promoCode: string | null = null;
const requestedPromo = input.checkout.promoCode?.trim();
if (requestedPromo) {
  const promo = await fetchPromo(supabase, requestedPromo);
  const promoError = promo ? validatePromo(promo, totals.subtotal, new Date()) : 'inactive';
  if (!promo || promoError) return { ok: false, error: 'invalid_promo' };
  const withDiscount = applyPromoToOrderTotals({ subtotalMinor: totals.subtotal, deliveryFeeMinor: totals.deliveryFee }, promo);
  totals = { subtotal: withDiscount.subtotalMinor, deliveryFee: withDiscount.deliveryFeeMinor, total: withDiscount.totalMinor };
  discountMinor = withDiscount.discountMinor;
  promoCode = promo.code;
}
```

And in the `orders` insert object, add after `total_minor: totals.total,`:

```ts
discount_minor: discountMinor,
promo_code: promoCode,
```

Immediately after the order insert succeeds (right after the `if (error || !order) return { ok: false, error: 'unavailable' };` line), increment usage best-effort:

```ts
if (promoCode) await supabase.rpc('increment_promo_usage', { p_code: promoCode });
```

- [ ] **Step 3: Map the new error in the route**

In `app/api/orders/route.ts`, change the failure mapping to:

```ts
if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.error === 'invalid_promo' ? 400 : 409 });
```

- [ ] **Step 4: Add the discount line to order emails**

In `features/notifications/email-templates.ts`, inside `renderOrderEmail`, after the `total` line, add:

```ts
const discount = input.discountMinor ? new Intl.NumberFormat(intlLocales[input.locale], { style: 'currency', currency: 'EGP', maximumFractionDigits: 0 }).format(input.discountMinor / 100) : null;
```

and change the `body` construction to append the discount when present:

```ts
const discountLine = discount ? (isArabic ? ` الخصم −${escapeHtml(discount)}` : isFrench ? ` Remise −${escapeHtml(discount)}` : ` Discount −${escapeHtml(discount)}`) : '';
const body = isArabic ? `رقم طلبك هو ${order}. إجمالي الطلب ${escapeHtml(total)}.${discountLine}` : isFrench ? `Votre numéro de commande est ${order}. Le total de la commande est ${escapeHtml(total)}.${discountLine}` : `Your order number is ${order}. The order total is ${escapeHtml(total)}.${discountLine}`;
```

- [ ] **Step 5: Add the email test**

Append to `tests/domain/email-templates.test.ts` (match the existing `renderOrderEmail` describe block style):

```ts
it('includes the discount line when discountMinor is set', () => {
  const { text } = renderOrderEmail({ locale: 'en', type: 'order_received', orderNumber: 'RO-1', totalMinor: 9000, discountMinor: 1000, orderUrl: 'https://example.com/o/1' });
  expect(text).toContain('Discount −EGP 10');
});

it('omits the discount line when absent', () => {
  const { text } = renderOrderEmail({ locale: 'en', type: 'order_received', orderNumber: 'RO-1', totalMinor: 10000, orderUrl: 'https://example.com/o/1' });
  expect(text).not.toContain('Discount');
});
```

- [ ] **Step 6: Verify the full suite and build**

Run: `npm test && npm run lint && npm run build`
Expected: 147 existing + 2 new email tests = **149 passed**; tsc clean; build succeeds.

- [ ] **Step 7: Commit**

```bash
git add features/order/types.ts features/checkout/types.ts features/order/supabase-repository.ts app/api/orders/route.ts features/notifications/email-types.ts features/notifications/email-templates.ts tests/domain/email-templates.test.ts
git commit -m "feat: enforce promo codes server-side at order creation"
```

---

### Task 4: Admin promos surface

**Files:**
- Create: `features/admin/promo-actions.ts`
- Create: `app/api/admin/promos/route.ts`
- Create: `components/admin/PromoForm.tsx`
- Create: `components/admin/AddPromoForm.tsx`
- Create: `app/admin/promos/page.tsx`
- Modify: `app/admin/page.tsx` (nav + dashboard link)
- Test: `tests/domain/promo-actions.test.ts`

**Interfaces:**
- Consumes: `AdminIdentity` from `@/features/admin/authorization`; `getCurrentAdmin`; `getAdminSupabase`.
- Produces:
  - `type PromoInput = { code: string; type: 'percent' | 'fixed'; percentOff: number | null; valueMinor: number | null; minimumOrderMinor: number; startsAt: string | null; expiresAt: string | null; maxUses: number; active: boolean }`
  - `savePromoCode(client, identity, input: PromoInput): Promise<'saved' | 'forbidden' | 'validation' | 'failure'>`
  - `createPromoCode(client, identity, input: PromoInput): Promise<'created' | 'forbidden' | 'validation' | 'code_taken' | 'failure'>`
  - `POST /api/admin/promos` — `action: 'update-promo' | 'create-promo'` dispatch.
  - `/admin/promos` page + `PromoForm`/`AddPromoForm` inline editors (delivery-editor pattern).

- [ ] **Step 1: Write the failing test**

`tests/domain/promo-actions.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { savePromoCode, createPromoCode, type PromoInput } from '@/features/admin/promo-actions';
import type { AdminRole } from '@/features/admin/authorization';

type Call = { table: string; op: string; payload?: unknown };

function fakeClient(seed: { existing?: { code: string } | null; failInsert?: boolean }) {
  const calls: Call[] = [];
  const from = (table: string) => ({
    select: () => ({ eq: (column: string, value: string) => ({ maybeSingle: async () => ({ data: seed.existing ?? null, error: null }) }) }),
    insert: (payload: unknown) => {
      calls.push({ table, op: 'insert', payload });
      return { error: seed.failInsert ? { message: 'insert failed' } : null };
    },
    update: (payload: unknown) => ({ eq: (value: string) => { calls.push({ table, op: 'update', payload, id: value }); return { error: null }; } }),
  });
  return { client: { from }, calls };
}

const admin = { userId: 'admin-1', role: 'admin' as const };
const operator = { userId: 'op-1', role: 'operator' as const };
const customer = { userId: 'c1', role: 'customer' as AdminRole };

const input: PromoInput = { code: 'ROSE10', type: 'percent', percentOff: 10, valueMinor: null, minimumOrderMinor: 0, startsAt: null, expiresAt: null, maxUses: 0, active: true };

function row(payload: Partial<Record<string, unknown>>) {
  return { ...input, ...payload } as PromoInput;
}

describe('savePromoCode', () => {
  it('updates an existing promo and audits', async () => {
    const { client, calls } = fakeClient({ existing: { code: 'ROSE10' } });
    const result = await savePromoCode(client, admin, row({ percentOff: 15 }));
    expect(result).toBe('saved');
    const update = calls.find((c) => c.table === 'promo_codes' && c.op === 'update');
    expect(update!.payload).toMatchObject({ percent_off: 15, active: true });
    expect(calls.find((c) => c.table === 'admin_audit_logs')).toBeDefined();
  });

  it('lets an operator save', async () => {
    const { client, calls } = fakeClient({ existing: { code: 'ROSE10' } });
    expect(await savePromoCode(client, operator, input)).toBe('saved');
    expect(calls.find((c) => c.table === 'admin_audit_logs')).toBeDefined();
  });

  it('rejects invalid input without writes', async () => {
    const { client, calls } = fakeClient({ existing: { code: 'ROSE10' } });
    expect(await savePromoCode(client, admin, row({ code: 'bad code!' }))).toBe('validation');
    expect(calls.filter((c) => c.op === 'update' || c.op === 'insert')).toEqual([]);
  });

  it('forbids a customer role without writes', async () => {
    const { client, calls } = fakeClient({ existing: { code: 'ROSE10' } });
    expect(await savePromoCode(client, customer, input)).toBe('forbidden');
    expect(calls).toEqual([]);
  });
});

describe('createPromoCode', () => {
  it('creates a promo and audits', async () => {
    const { client, calls } = fakeClient({ existing: null });
    const result = await createPromoCode(client, admin, input);
    expect(result).toBe('created');
    expect(calls.find((c) => c.table === 'promo_codes' && c.op === 'insert')).toBeDefined();
    expect(calls.find((c) => c.table === 'admin_audit_logs')).toBeDefined();
  });

  it('returns code_taken with no writes on duplicate', async () => {
    const { client, calls } = fakeClient({ existing: { code: 'ROSE10' } });
    expect(await createPromoCode(client, operator, input)).toBe('code_taken');
    expect(calls).toEqual([]);
  });

  it('rejects a percent code that also has a fixed value', async () => {
    const { client, calls } = fakeClient({ existing: null });
    expect(await createPromoCode(client, admin, row({ valueMinor: 1000 }))).toBe('validation');
    expect(calls).toEqual([]);
  });

  it('forbids a customer role without writes', async () => {
    const { client, calls } = fakeClient({ existing: null });
    expect(await createPromoCode(client, customer, input)).toBe('forbidden');
    expect(calls).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/domain/promo-actions.test.ts`
Expected: FAIL — module `@/features/admin/promo-actions` not found.

- [ ] **Step 3: Implement the services**

`features/admin/promo-actions.ts`:

```ts
import type { AdminIdentity } from './authorization';

export type PromoInput = { code: string; type: 'percent' | 'fixed'; percentOff: number | null; valueMinor: number | null; minimumOrderMinor: number; startsAt: string | null; expiresAt: string | null; maxUses: number; active: boolean };

export type PromoSaveResult = 'saved' | 'forbidden' | 'validation' | 'failure';
export type PromoCreateResult = 'created' | 'forbidden' | 'validation' | 'code_taken' | 'failure';

type PromoClient = { from: (table: string) => any };

const CODE_PATTERN = /^[A-Z0-9][A-Z0-9-]*$/;

function canEdit(identity: AdminIdentity): boolean {
  return identity.role === 'admin' || identity.role === 'operator';
}

function normalize(input: PromoInput): PromoInput {
  return { ...input, code: input.code.trim().toUpperCase() };
}

export function validatePromoInput(input: PromoInput): string | null {
  if (!CODE_PATTERN.test(input.code.trim().toUpperCase())) return 'invalid_code';
  if (input.type !== 'percent' && input.type !== 'fixed') return 'invalid_type';
  if (input.type === 'percent') {
    if (input.valueMinor !== null || input.percentOff === null || !Number.isInteger(input.percentOff) || input.percentOff < 0 || input.percentOff > 100) return 'invalid_percent';
  } else {
    if (input.percentOff !== null || input.valueMinor === null || !Number.isInteger(input.valueMinor) || input.valueMinor < 0) return 'invalid_value';
  }
  if (!Number.isInteger(input.minimumOrderMinor) || input.minimumOrderMinor < 0) return 'invalid_minimum';
  if (!Number.isInteger(input.maxUses) || input.maxUses < 0) return 'invalid_max_uses';
  if (input.startsAt && input.expiresAt && input.startsAt >= input.expiresAt) return 'invalid_dates';
  return null;
}

function toRow(input: PromoInput) {
  return {
    code: input.code.trim().toUpperCase(),
    type: input.type,
    percent_off: input.type === 'percent' ? input.percentOff : null,
    value_minor: input.type === 'fixed' ? input.valueMinor : null,
    minimum_order_minor: input.minimumOrderMinor,
    starts_at: input.startsAt ?? null,
    expires_at: input.expiresAt ?? null,
    max_uses: input.maxUses,
    active: input.active,
  };
}

export async function savePromoCode(client: PromoClient, identity: AdminIdentity, input: PromoInput): Promise<PromoSaveResult> {
  if (!canEdit(identity)) return 'forbidden';
  const normalized = normalize(input);
  if (validatePromoInput(normalized)) return 'validation';
  try {
    const { error } = await client.from('promo_codes').update(toRow(normalized)).eq('code', normalized.code);
    if (error) return 'failure';
    await client.from('admin_audit_logs').insert({ actor_id: identity.userId, action: 'update_promo', target_type: 'promo', target_id: normalized.code, metadata: { code: normalized.code } });
    return 'saved';
  } catch {
    return 'failure';
  }
}

export async function createPromoCode(client: PromoClient, identity: AdminIdentity, input: PromoInput): Promise<PromoCreateResult> {
  if (!canEdit(identity)) return 'forbidden';
  const normalized = normalize(input);
  if (validatePromoInput(normalized)) return 'validation';
  try {
    const { data: existing } = await client.from('promo_codes').select('code').eq('code', normalized.code).maybeSingle();
    if (existing) return 'code_taken';
    const { error } = await client.from('promo_codes').insert(toRow(normalized));
    if (error) return 'failure';
    await client.from('admin_audit_logs').insert({ actor_id: identity.userId, action: 'create_promo', target_type: 'promo', target_id: normalized.code, metadata: { code: normalized.code } });
    return 'created';
  } catch {
    return 'failure';
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/domain/promo-actions.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Create the route**

`app/api/admin/promos/route.ts` (thin, same shape as `app/api/admin/delivery/route.ts`):

```ts
import { NextResponse } from 'next/server';
import { savePromoCode, createPromoCode, type PromoInput } from '@/features/admin/promo-actions';
import { getCurrentAdmin } from '@/features/auth/server';
import { getAdminSupabase } from '@/lib/supabase/admin';

export async function POST(request: Request) {
  const identity = await getCurrentAdmin();
  if (!identity) return NextResponse.json({ error: 'Admin authorization required' }, { status: 403 });
  const body = (await request.json()) as Record<string, unknown>;
  const input = body.promo as unknown;
  if (!input || typeof input !== 'object') return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  const promo = input as PromoInput;
  if (body.action === 'update-promo') {
    const result = await savePromoCode(getAdminSupabase(), identity, promo);
    if (result === 'forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    if (result === 'validation') return NextResponse.json({ error: 'Invalid promo data' }, { status: 400 });
    if (result === 'failure') return NextResponse.json({ error: 'Could not save promo' }, { status: 500 });
    return NextResponse.json({ ok: true });
  }
  if (body.action === 'create-promo') {
    const result = await createPromoCode(getAdminSupabase(), identity, promo);
    if (result === 'forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    if (result === 'validation') return NextResponse.json({ error: 'Invalid promo data' }, { status: 400 });
    if (result === 'code_taken') return NextResponse.json({ error: 'Code already exists' }, { status: 409 });
    if (result === 'failure') return NextResponse.json({ error: 'Could not create promo' }, { status: 500 });
    return NextResponse.json({ ok: true }, { status: 201 });
  }
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
```

- [ ] **Step 6: Create the forms**

`components/admin/PromoForm.tsx` (inline per-row editor; code shown read-only — the code is the upsert key):

```tsx
'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import type { PromoInput } from '@/features/admin/promo-actions';

function toMinor(egp: string): number {
  const parsed = Number.parseFloat(egp);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

function minorToEgp(minor: number): string {
  return (minor / 100).toFixed(2);
}

export function PromoForm({ promo }: { promo: PromoInput }) {
  const router = useRouter();
  const [type, setType] = useState<'percent' | 'fixed'>(promo.type);
  const [percent, setPercent] = useState(String(promo.percentOff ?? 0));
  const [value, setValue] = useState(minorToEgp(promo.valueMinor ?? 0));
  const [minimum, setMinimum] = useState(minorToEgp(promo.minimumOrderMinor));
  const [startsAt, setStartsAt] = useState(promo.startsAt?.slice(0, 10) ?? '');
  const [expiresAt, setExpiresAt] = useState(promo.expiresAt?.slice(0, 10) ?? '');
  const [maxUses, setMaxUses] = useState(String(promo.maxUses));
  const [active, setActive] = useState(promo.active);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    const body: PromoInput = {
      code: promo.code,
      type,
      percentOff: type === 'percent' ? Number.parseInt(percent, 10) : null,
      valueMinor: type === 'fixed' ? toMinor(value) : null,
      minimumOrderMinor: toMinor(minimum),
      startsAt: startsAt ? `${startsAt}T00:00:00Z` : null,
      expiresAt: expiresAt ? `${expiresAt}T00:00:00Z` : null,
      maxUses: Number.parseInt(maxUses, 10),
      active,
    };
    const response = await fetch('/api/admin/promos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'update-promo', promo: body }) });
    if (!response.ok) { setError('Could not save the promo.'); setSaving(false); return; }
    router.refresh();
  }

  return <form className="quantity-control" onSubmit={submit}>
    <select value={type} onChange={(e) => setType(e.target.value as 'percent' | 'fixed')} aria-label="Type"><option value="percent">%</option><option value="fixed">EGP</option></select>
    {type === 'percent' ? <input type="number" min="0" max="100" value={percent} onChange={(e) => setPercent(e.target.value)} aria-label="Percent off" /> : <input type="number" min="0" step="0.01" value={value} onChange={(e) => setValue(e.target.value)} aria-label="Amount (EGP)" />}
    <input type="number" min="0" step="0.01" value={minimum} onChange={(e) => setMinimum(e.target.value)} aria-label="Minimum order (EGP)" />
    <input type="date" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} aria-label="Starts" />
    <input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} aria-label="Expires" />
    <input type="number" min="0" value={maxUses} onChange={(e) => setMaxUses(e.target.value)} aria-label="Max uses (0 = unlimited)" />
    <label className="choice"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /><span>Active</span></label>
    <button className="button" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
    {error ? <small className="field-error">{error}</small> : null}
  </form>;
}
```

`components/admin/AddPromoForm.tsx` (new-code form at the top of the page; same fields plus a code input; posts `action: 'create-promo'`; shows the 409 duplicate message):

```tsx
'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import type { PromoInput } from '@/features/admin/promo-actions';

function toMinor(egp: string): number {
  const parsed = Number.parseFloat(egp);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

const empty = { code: '', type: 'percent' as const, percent: '10', value: '', minimum: '', startsAt: '', expiresAt: '', maxUses: '0', active: true };

export function AddPromoForm() {
  const router = useRouter();
  const [form, setForm] = useState(empty);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function patch(p: Partial<typeof empty>) { setForm((current) => ({ ...current, ...p })); }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    const body: PromoInput = {
      code: form.code,
      type: form.type,
      percentOff: form.type === 'percent' ? Number.parseInt(form.percent, 10) : null,
      valueMinor: form.type === 'fixed' ? toMinor(form.value) : null,
      minimumOrderMinor: toMinor(form.minimum),
      startsAt: form.startsAt ? `${form.startsAt}T00:00:00Z` : null,
      expiresAt: form.expiresAt ? `${form.expiresAt}T00:00:00Z` : null,
      maxUses: Number.parseInt(form.maxUses, 10),
      active: form.active,
    };
    const response = await fetch('/api/admin/promos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'create-promo', promo: body }) });
    if (!response.ok) { setError(response.status === 409 ? 'That code already exists.' : 'Could not create the promo.'); setSaving(false); return; }
    router.refresh();
    setForm(empty);
  }

  return <form className="checkout-form" onSubmit={submit} noValidate>
    {error ? <div className="status-message" role="alert"><strong>{error}</strong></div> : null}
    <section className="form-section"><p className="eyebrow">Add promo</p><div className="form-grid">
      <label className="field"><span>Code</span><input type="text" value={form.code} onChange={(e) => patch({ code: e.target.value })} placeholder="ROSE10" required /></label>
      <label className="field"><span>Type</span><select value={form.type} onChange={(e) => patch({ type: e.target.value as 'percent' | 'fixed' })}><option value="percent">Percent</option><option value="fixed">Fixed amount</option></select></label>
      {form.type === 'percent' ? <label className="field"><span>Percent off</span><input type="number" min="0" max="100" value={form.percent} onChange={(e) => patch({ percent: e.target.value })} required /></label> : <label className="field"><span>Amount (EGP)</span><input type="number" min="0" step="0.01" value={form.value} onChange={(e) => patch({ value: e.target.value })} required /></label>}
      <label className="field"><span>Minimum order (EGP)</span><input type="number" min="0" step="0.01" value={form.minimum} onChange={(e) => patch({ minimum: e.target.value })} /></label>
      <label className="field"><span>Starts</span><input type="date" value={form.startsAt} onChange={(e) => patch({ startsAt: e.target.value })} /></label>
      <label className="field"><span>Expires</span><input type="date" value={form.expiresAt} onChange={(e) => patch({ expiresAt: e.target.value })} /></label>
      <label className="field"><span>Max uses (0 = unlimited)</span><input type="number" min="0" value={form.maxUses} onChange={(e) => patch({ maxUses: e.target.value })} /></label>
      <label className="choice span-two"><input type="checkbox" checked={form.active} onChange={(e) => patch({ active: e.target.checked })} /><span>Active</span></label>
    </div></section>
    <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Add promo'}</Button>
  </form>;
}
```

- [ ] **Step 7: Create the page and add links**

`app/admin/promos/page.tsx`:

```tsx
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AddPromoForm } from '@/components/admin/AddPromoForm';
import { PromoForm } from '@/components/admin/PromoForm';
import type { PromoInput } from '@/features/admin/promo-actions';
import { getCurrentAdmin } from '@/features/auth/server';
import { getAdminSupabase } from '@/lib/supabase/admin';

type PromoRow = { code: string; type: 'percent' | 'fixed'; percent_off: number | null; value_minor: number | null; minimum_order_minor: number; starts_at: string | null; expires_at: string | null; max_uses: number; used_count: number; active: boolean };

export default async function AdminPromosPage() {
  const admin = await getCurrentAdmin();
  if (!admin) redirect('/login');
  const { data } = await getAdminSupabase().from('promo_codes').select('*').order('created_at', { ascending: false });
  const rows = (data ?? []) as PromoRow[];
  return <main className="content-frame">
    <p className="eyebrow">Promo operations</p>
    <h1>Promo codes</h1>
    <AddPromoForm />
    <div className="admin-table">
      {rows.map((row) => {
        const promo: PromoInput = { code: row.code, type: row.type, percentOff: row.percent_off, valueMinor: row.value_minor, minimumOrderMinor: row.minimum_order_minor, startsAt: row.starts_at, expiresAt: row.expires_at, maxUses: row.max_uses, active: row.active };
        return <article className="status-message" key={row.code}>
          <strong>{row.code}</strong>
          <span>{row.type === 'percent' ? `${row.percent_off}%` : `${(row.value_minor ?? 0) / 100} EGP`} · min {(row.minimum_order_minor / 100).toFixed(2)} EGP · {row.used_count}/{row.max_uses === 0 ? '∞' : row.max_uses} uses · {row.active ? 'Active' : 'Inactive'}</span>
          <PromoForm promo={promo} />
        </article>;
      })}
    </div>
    <p><Link href="/admin">Back to dashboard</Link></p>
  </main>;
}
```

In `app/admin/page.tsx`, add a `Promos` link to the admin nav (next to `Delivery rules`) and a `Promos` stat-card link row. Concretely, add `<Link className="button" href="/admin/promos">Promos</Link>` inside the existing `<nav className="admin-links">` element.

- [ ] **Step 8: Verify the full gate for this task**

Run: `npm test && npm run lint && npm run build`
Expected: 149 existing + 8 new = **157 passed**; tsc clean; build succeeds; `/admin/promos` and `/api/admin/promos` in the build output.

- [ ] **Step 9: Commit**

```bash
git add features/admin/promo-actions.ts app/api/admin/promos/route.ts components/admin/PromoForm.tsx components/admin/AddPromoForm.tsx app/admin/promos/page.tsx app/admin/page.tsx tests/domain/promo-actions.test.ts
git commit -m "feat: add admin promo codes manager"
```

---

### Task 5: Final verification

- [ ] **Step 1: Run the full gate**

Run: `npm test && npm run lint && npm run build && git diff --check`
Expected: all tests pass (135 existing + 22 new = **157**), tsc clean, build succeeds, no whitespace errors.

- [ ] **Step 2: Secret scan**

Run: `npm test -- tests/security/no-secrets.test.ts`
Expected: PASS — the repository secret scan covers all `ts/tsx/js/mjs/json/md/env/sql/css` files.

- [ ] **Step 3: Commit any stragglers**

```bash
git status --short
git add -A
git commit -m "chore: final promo codes verification" || echo "nothing to commit"
```
