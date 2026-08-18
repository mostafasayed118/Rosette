# Admin UI/UX + Responsive Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix admin UI/UX, accessibility, responsiveness, and consistency defects, plus an on-brand design-system polish (status semantics, dense cards), without a visual redesign or backend changes.

**Architecture:** A shared status-label mapper and money helpers underpin the work; the broken promos surface is rebuilt onto shadcn; tables get `overflow-x-auto`; admin forms consolidate onto shadcn `Input`/`Select`/`Field`; and the dashboard/orders/inventory pages are polished in place.

**Tech Stack:** Next.js 16 (App Router), React 19, Tailwind CSS v4, shadcn/ui (Radix primitives), TypeScript, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-08-18-admin-ui-ux-audit-design.md`

## Global Constraints

- No new dependencies; use existing shadcn components and brand tokens.
- No change to brand tokens/fonts in `globals.css` (rose/sage/cream, Fraunces + Inter/Cairo).
- No behavior changes to API routes, data model, fetches, validation, or i18n keys (reuse the existing `status*` keys).
- Admin surface only — do not touch storefront pages/components.
- TDD: write the failing test first, confirm red, implement, confirm green, commit per task.
- Baseline test count: 179. Expected final: 191 (12 new).

---

### Task 1: Admin money helpers

**Files:**
- Create: `features/admin/money.ts`
- Test: `tests/domain/admin-money.test.ts`

**Interfaces:**
- Produces: `toMinor(egp: string): number` and `minorToEgp(minor: number): string`. Consumed by `ProductForm`, `DeliveryRuleForm`, `AddCityForm`, `PromoForm`, `AddPromoForm` in Tasks 4 and 7.

- [ ] **Step 1: Write the failing test**

Create `tests/domain/admin-money.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { minorToEgp, toMinor } from '@/features/admin/money';

describe('admin money helpers', () => {
  it('round-trips minor to EGP string and back', () => {
    expect(minorToEgp(1234)).toBe('12.34');
    expect(toMinor('12.34')).toBe(1234);
  });

  it('handles zero and empty string', () => {
    expect(minorToEgp(0)).toBe('0.00');
    expect(toMinor('')).toBe(0);
  });

  it('rounds fractional EGP to the nearest minor unit', () => {
    expect(toMinor('12.345')).toBe(1235);
  });

  it('returns 0 for non-numeric input', () => {
    expect(toMinor('abc')).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/domain/admin-money.test.ts`
Expected: FAIL — cannot resolve `@/features/admin/money`.

- [ ] **Step 3: Write the minimal implementation**

Create `features/admin/money.ts`:

```ts
export function toMinor(egp: string): number {
  const parsed = Number.parseFloat(egp);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

export function minorToEgp(minor: number): string {
  return (minor / 100).toFixed(2);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/domain/admin-money.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add features/admin/money.ts tests/domain/admin-money.test.ts
git commit -m "feat: add shared admin money helpers"
```

---

### Task 2: Status label + badge-variant mapper

**Files:**
- Create: `features/admin/status-labels.ts`
- Test: `tests/domain/status-labels.test.ts`

**Interfaces:**
- Produces (consumed by Tasks 5–6):
  - `fulfillmentStatusKeys: Record<string, string>`
  - `paymentStatusKeys: Record<string, string>`
  - `fulfillmentBadgeVariant(status: string): 'success' | 'warning' | 'destructive' | 'default' | 'secondary'`
  - `paymentBadgeVariant(status: string): 'success' | 'warning' | 'destructive' | 'default' | 'secondary'`
  - `fulfillmentLabel(status: string, t: (key: string) => string): string`
  - `paymentLabel(status: string, t: (key: string) => string): string`

- [ ] **Step 1: Write the failing test**

Create `tests/domain/status-labels.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { fulfillmentBadgeVariant, fulfillmentLabel, fulfillmentStatusKeys, paymentBadgeVariant, paymentLabel, paymentStatusKeys } from '@/features/admin/status-labels';

describe('status labels', () => {
  it('maps fulfillment statuses to i18n keys', () => {
    expect(fulfillmentStatusKeys).toEqual({
      confirmed: 'statusConfirmed', preparing: 'statusPreparing', ready_for_delivery: 'statusReadyForDelivery',
      out_for_delivery: 'statusOutForDelivery', delivered: 'statusDelivered', cancelled: 'statusCancelled',
    });
  });

  it('maps payment statuses to i18n keys', () => {
    expect(paymentStatusKeys).toEqual({
      pending: 'statusPending', payment_started: 'statusPaymentStarted', paid: 'statusPaid',
      payment_failed: 'statusPaymentFailed', cancelled: 'statusCancelled', refunded: 'statusRefunded',
    });
  });

  it('assigns fulfillment badge variants', () => {
    expect(fulfillmentBadgeVariant('delivered')).toBe('success');
    expect(fulfillmentBadgeVariant('cancelled')).toBe('destructive');
    expect(fulfillmentBadgeVariant('out_for_delivery')).toBe('default');
    expect(fulfillmentBadgeVariant('preparing')).toBe('secondary');
  });

  it('assigns payment badge variants', () => {
    expect(paymentBadgeVariant('paid')).toBe('success');
    expect(paymentBadgeVariant('refunded')).toBe('warning');
    expect(paymentBadgeVariant('payment_failed')).toBe('destructive');
    expect(paymentBadgeVariant('cancelled')).toBe('destructive');
    expect(paymentBadgeVariant('pending')).toBe('secondary');
  });

  it('falls back safely for unknown statuses', () => {
    const t = (key: string) => `[${key}]`;
    expect(fulfillmentLabel('weird', t)).toBe('[weird]');
    expect(fulfillmentBadgeVariant('weird')).toBe('secondary');
  });

  it('resolves labels through the t function', () => {
    const t = (key: string) => `[${key}]`;
    expect(paymentLabel('paid', t)).toBe('[statusPaid]');
    expect(fulfillmentLabel('delivered', t)).toBe('[statusDelivered]');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/domain/status-labels.test.ts`
Expected: FAIL — cannot resolve `@/features/admin/status-labels`.

- [ ] **Step 3: Write the minimal implementation**

Create `features/admin/status-labels.ts`:

```ts
export type BadgeTone = 'success' | 'warning' | 'destructive' | 'default' | 'secondary';

export const fulfillmentStatusKeys: Record<string, string> = {
  confirmed: 'statusConfirmed',
  preparing: 'statusPreparing',
  ready_for_delivery: 'statusReadyForDelivery',
  out_for_delivery: 'statusOutForDelivery',
  delivered: 'statusDelivered',
  cancelled: 'statusCancelled',
};

export const paymentStatusKeys: Record<string, string> = {
  pending: 'statusPending',
  payment_started: 'statusPaymentStarted',
  paid: 'statusPaid',
  payment_failed: 'statusPaymentFailed',
  cancelled: 'statusCancelled',
  refunded: 'statusRefunded',
};

export function fulfillmentBadgeVariant(status: string): BadgeTone {
  if (status === 'delivered') return 'success';
  if (status === 'cancelled') return 'destructive';
  if (status === 'out_for_delivery') return 'default';
  return 'secondary';
}

export function paymentBadgeVariant(status: string): BadgeTone {
  if (status === 'paid') return 'success';
  if (status === 'refunded') return 'warning';
  if (status === 'payment_failed' || status === 'cancelled') return 'destructive';
  return 'secondary';
}

export function fulfillmentLabel(status: string, t: (key: string) => string): string {
  return t(fulfillmentStatusKeys[status] ?? status);
}

export function paymentLabel(status: string, t: (key: string) => string): string {
  return t(paymentStatusKeys[status] ?? status);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/domain/status-labels.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add features/admin/status-labels.ts tests/domain/status-labels.test.ts
git commit -m "feat: add admin status label and badge-variant mapper"
```

---

### Task 3: `success` and `warning` Badge variants

**Files:**
- Modify: `components/ui/badge.tsx`
- Test: `tests/components/Badge.test.tsx`

**Interfaces:**
- Produces: `Badge` accepts `variant="success"` and `variant="warning"` (text + color, using existing `--color-success`/`--color-warning` tokens). Consumed by the status badges in Tasks 5–6.

- [ ] **Step 1: Write the failing test**

Create `tests/components/Badge.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Badge } from '@/components/ui/badge';

describe('Badge', () => {
  it('renders the success variant with its label', () => {
    const { container } = render(<Badge variant="success">Paid</Badge>);
    expect(screen.getByText('Paid')).toBeInTheDocument();
    expect(container.firstChild).toHaveAttribute('data-variant', 'success');
  });

  it('renders the warning variant with its label', () => {
    const { container } = render(<Badge variant="warning">Refunded</Badge>);
    expect(screen.getByText('Refunded')).toBeInTheDocument();
    expect(container.firstChild).toHaveAttribute('data-variant', 'warning');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/components/Badge.test.tsx`
Expected: FAIL — `success`/`warning` are not accepted variant values (type error + no such styling).

- [ ] **Step 3: Write the implementation**

In `components/ui/badge.tsx`, add two entries to the `variant` object of `badgeVariants` (inside the `variants.variant` map):

```ts
success:
  "bg-success/15 text-success [a&]:hover:bg-success/25 dark:bg-success/20",
warning:
  "bg-warning/15 text-warning [a&]:hover:bg-warning/25 dark:bg-warning/20",
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/components/Badge.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add components/ui/badge.tsx tests/components/Badge.test.tsx
git commit -m "feat: add success and warning badge variants"
```

---

### Task 4: Rebuild the promos admin onto shadcn

**Files:**
- Modify: `components/admin/PromoForm.tsx`
- Modify: `components/admin/AddPromoForm.tsx`
- Modify: `app/admin/promos/page.tsx`

**Interfaces:**
- Consumes: `toMinor`/`minorToEgp` (Task 1).
- Produces: same props/exports as today (`PromoForm { promo }`, `AddPromoForm`, default page) — only the markup changes.

- [ ] **Step 1: Rewrite `components/admin/PromoForm.tsx`**

Replace the file with:

```tsx
'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useI18n } from '@/features/i18n/I18nProvider';
import { minorToEgp, toMinor } from '@/features/admin/money';
import type { PromoInput } from '@/features/admin/promo-actions';

export function PromoForm({ promo }: { promo: PromoInput }) {
  const router = useRouter();
  const { t } = useI18n();
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
    if (!response.ok) { setError(t('couldNotSavePromo')); setSaving(false); return; }
    router.refresh();
  }

  return <form className="flex flex-wrap items-end gap-2" onSubmit={submit}>
    <Select value={type} onValueChange={(v) => setType(v as 'percent' | 'fixed')}>
      <SelectTrigger className="h-10 w-24" aria-label={t('promoType')}><SelectValue /></SelectTrigger>
      <SelectContent><SelectItem value="percent">%</SelectItem><SelectItem value="fixed">EGP</SelectItem></SelectContent>
    </Select>
    {type === 'percent'
      ? <Input className="h-10 w-24" type="number" min={0} max={100} value={percent} onChange={(e) => setPercent(e.target.value)} aria-label={t('percentOff')} />
      : <Input className="h-10 w-28" type="number" min={0} step="0.01" value={value} onChange={(e) => setValue(e.target.value)} aria-label={t('amountEgp')} />}
    <Input className="h-10 w-28" type="number" min={0} step="0.01" value={minimum} onChange={(e) => setMinimum(e.target.value)} aria-label={t('minimumOrderEgp')} />
    <Input className="h-10 w-36" type="date" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} aria-label={t('starts')} />
    <Input className="h-10 w-36" type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} aria-label={t('expires')} />
    <Input className="h-10 w-24" type="number" min={0} value={maxUses} onChange={(e) => setMaxUses(e.target.value)} aria-label={t('maxUses')} />
    <label className="flex h-10 items-center gap-2 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="accent-primary" /><span className="text-sm">{t('active')}</span></label>
    <Button size="sm" type="submit" disabled={saving}>{saving ? t('saving') : t('save')}</Button>
    {error ? <small className="text-sm text-destructive">{error}</small> : null}
  </form>;
}
```

- [ ] **Step 2: Rewrite `components/admin/AddPromoForm.tsx`**

Replace the file with:

```tsx
'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StatusMessage } from '@/components/ui/status-message';
import { useI18n } from '@/features/i18n/I18nProvider';
import { toMinor } from '@/features/admin/money';
import type { PromoInput } from '@/features/admin/promo-actions';

const empty = { code: '', type: 'percent' as 'percent' | 'fixed', percent: '10', value: '', minimum: '', startsAt: '', expiresAt: '', maxUses: '0', active: true };

export function AddPromoForm() {
  const router = useRouter();
  const { t } = useI18n();
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
    if (!response.ok) { setError(response.status === 409 ? t('codeExists') : t('couldNotCreatePromo')); setSaving(false); return; }
    router.refresh();
    setForm(empty);
  }

  return <form className="grid max-w-[60rem] gap-6" onSubmit={submit} noValidate>
    {error ? <StatusMessage title={error} tone="error" /> : null}
    <section className="grid gap-4 border-b py-6"><p className="text-xs font-bold uppercase tracking-[.16em] text-sage">{t('addPromo')}</p><div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
      <Field id="promo-code" label={t('promoCode')} value={form.code} onChange={(e) => patch({ code: e.target.value })} placeholder="ROSE10" required />
      <div className="grid gap-1.5"><span className="text-sm font-bold text-foreground">{t('promoType')}</span><Select value={form.type} onValueChange={(v) => patch({ type: v as 'percent' | 'fixed' })}><SelectTrigger id="promo-type"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="percent">{t('percentOff')}</SelectItem><SelectItem value="fixed">{t('amountEgp')}</SelectItem></SelectContent></Select></div>
      {form.type === 'percent'
        ? <Field id="percent-off" label={t('percentOff')} type="number" min={0} max={100} value={form.percent} onChange={(e) => patch({ percent: e.target.value })} required />
        : <Field id="amount-egp" label={t('amountEgp')} type="number" min={0} step="0.01" value={form.value} onChange={(e) => patch({ value: e.target.value })} required />}
      <Field id="minimum-order" label={t('minimumOrderEgp')} type="number" min={0} step="0.01" value={form.minimum} onChange={(e) => patch({ minimum: e.target.value })} />
      <Field id="starts-at" label={t('starts')} type="date" value={form.startsAt} onChange={(e) => patch({ startsAt: e.target.value })} />
      <Field id="expires-at" label={t('expires')} type="date" value={form.expiresAt} onChange={(e) => patch({ expiresAt: e.target.value })} />
      <Field id="max-uses" label={t('maxUses')} type="number" min={0} value={form.maxUses} onChange={(e) => patch({ maxUses: e.target.value })} />
      <label className="col-span-2 flex items-center gap-3 rounded-2xl border border-border bg-card p-4 max-md:col-span-1 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"><input type="checkbox" checked={form.active} onChange={(e) => patch({ active: e.target.checked })} className="accent-primary" /><span>{t('active')}</span></label>
    </div></section>
    <Button type="submit" disabled={saving}>{saving ? t('saving') : t('addPromo')}</Button>
  </form>;
}
```

- [ ] **Step 3: Rewrite `app/admin/promos/page.tsx`**

Replace the page's `return <AdminShell>…</AdminShell>;` body so it uses the standard heading + a `Card` list (mirroring the delivery page). The data fetch and `PromoRow`/`PromoInput` mapping stay unchanged. New body:

```tsx
  return <AdminShell>
    <p className="text-xs font-bold uppercase tracking-[.16em] text-sage">{t('promoOperations')}</p>
    <h1 className="font-display text-[clamp(2rem,4vw,3rem)] leading-tight tracking-[-.02em]">{t('promos')}</h1>
    <AddPromoForm />
    <div className="mt-6 grid gap-4">
      {rows.map((row) => {
        const promo: PromoInput = { code: row.code, type: row.type, percentOff: row.percent_off, valueMinor: row.value_minor, minimumOrderMinor: row.minimum_order_minor, startsAt: row.starts_at, expiresAt: row.expires_at, maxUses: row.max_uses, active: row.active };
        return <Card key={row.code}><CardContent className="grid gap-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <strong>{row.code}</strong>
            <Badge variant={row.active ? 'default' : 'secondary'}>{row.active ? t('active') : t('inactive')}</Badge>
            <span className="text-sm text-muted-foreground">{row.type === 'percent' ? `${row.percent_off}%` : `${minorToEgp(row.value_minor ?? 0)} EGP`} · {t('minimumOrderEgp')} {minorToEgp(row.minimum_order_minor)} · {row.used_count}/{row.max_uses === 0 ? '∞' : row.max_uses} {t('uses')}</span>
          </div>
          <PromoForm promo={promo} />
        </CardContent></Card>;
      })}
    </div>
    <p className="mt-6"><Link className="text-sm text-primary underline underline-offset-4" href="/admin">{t('backToDashboard')}</Link></p>
  </AdminShell>;
```

Add these imports to the page: `import { Badge } from '@/components/ui/badge';`, `import { Card, CardContent } from '@/components/ui/card';`, `import { minorToEgp } from '@/features/admin/money';`. Remove the now-unused `Card`-only import if it conflicts (use `Card, CardContent`).

- [ ] **Step 4: Verify**

Run: `npm run lint` and `npm test`
Expected: tsc clean; 191 tests pass.

- [ ] **Step 5: Commit**

```bash
git add components/admin/PromoForm.tsx components/admin/AddPromoForm.tsx app/admin/promos/page.tsx
git commit -m "refactor: rebuild promos admin onto shadcn components"
```

---

### Task 5: Orders list + order detail status labels, timeline locale, table overflow

**Files:**
- Modify: `app/admin/orders/page.tsx`
- Modify: `app/admin/orders/[id]/page.tsx`

**Interfaces:**
- Consumes: `paymentLabel`/`paymentBadgeVariant`/`fulfillmentLabel`/`fulfillmentBadgeVariant` (Task 2).

- [ ] **Step 1: `app/admin/orders/page.tsx`**

Add import: `import { paymentBadgeVariant, paymentLabel, fulfillmentBadgeVariant, fulfillmentLabel } from '@/features/admin/status-labels';`

Replace the two status cells:
- `<Badge variant="secondary">{order.payment_status}</Badge>` → `<Badge variant={paymentBadgeVariant(order.payment_status)}>{paymentLabel(order.payment_status, t)}</Badge>`
- `<Badge>{order.fulfillment_status}</Badge>` → `<Badge variant={fulfillmentBadgeVariant(order.fulfillment_status)}>{fulfillmentLabel(order.fulfillment_status, t)}</Badge>`

Wrap the table in a scroll container: change `<Card><Table>` → `<Card><div className="overflow-x-auto"><Table>` and the matching `</Table></Card>` → `</Table></div></Card>`.

- [ ] **Step 2: `app/admin/orders/[id]/page.tsx`**

Add import: `import { paymentLabel, fulfillmentLabel } from '@/features/admin/status-labels';`

Replace the status summary line:

```tsx
<p className="text-muted-foreground">{formatMoney(order.total_minor, locale)} · {t('payment')} {order.payment_status} · {t('fulfillmentFilter')} {order.fulfillment_status}</p>
```

with:

```tsx
<p className="text-muted-foreground">{formatMoney(order.total_minor, locale)} · {t('payment')} {paymentLabel(order.payment_status, t)} · {t('fulfillmentFilter')} {fulfillmentLabel(order.fulfillment_status, t)}</p>
```

Replace the timeline date formatter `new Date(event.created_at).toLocaleString('en-GB')` with `new Date(event.created_at).toLocaleString(locale === 'ar' ? 'ar-EG' : locale === 'fr' ? 'fr-FR' : 'en-GB')`.

- [ ] **Step 3: Verify**

Run: `npm run lint` and `npm test`
Expected: tsc clean; 191 tests pass.

- [ ] **Step 4: Commit**

```bash
git add app/admin/orders/page.tsx app/admin/orders/[id]/page.tsx
git commit -m "feat: localize admin order statuses and timeline, wrap table"
```

---

### Task 6: Dashboard status labels, `formatMoney`, table overflow

**Files:**
- Modify: `app/admin/page.tsx`

**Interfaces:**
- Consumes: `fulfillmentLabel`/`fulfillmentBadgeVariant` (Task 2), `formatMoney` (existing).

- [ ] **Step 1: Update imports and locale**

Add import: `import { fulfillmentBadgeVariant, fulfillmentLabel } from '@/features/admin/status-labels';`

Change `const { t } = await getServerT();` to `const { t, locale } = await getServerT();`.

Delete the local `const egp = (minor: number) => \`${(minor / 100).toFixed(2)} EGP\`;` helper.

- [ ] **Step 2: Replace revenue values**

Replace `{egp(stats.revenueTodayMinor)}` with `{formatMoney(stats.revenueTodayMinor, locale)}` and `{egp(stats.revenueAllTimeMinor)}` with `{formatMoney(stats.revenueAllTimeMinor, locale)}`. (Add `import { formatMoney } from '@/features/money';`.)

- [ ] **Step 3: Pipeline cards**

Replace the pipeline card body:

```tsx
<Card key={status}><CardHeader><CardTitle className="text-sm font-medium">{status}</CardTitle></CardHeader><CardContent><Progress value={(count / maxPipeline) * 100} className="h-2" /><p className="mt-2 text-sm text-muted-foreground">{count}</p></CardContent></Card>
```

with:

```tsx
<Card key={status}><CardHeader className="flex flex-row items-center justify-between gap-3"><CardTitle className="text-sm font-medium">{fulfillmentLabel(status, t)}</CardTitle><Badge variant={fulfillmentBadgeVariant(status)}>{count}</Badge></CardHeader><CardContent><Progress value={(count / maxPipeline) * 100} className="h-2" /></CardContent></Card>
```

- [ ] **Step 4: Low-stock table overflow**

Wrap the low-stock table: change `<Card className="mt-4"><Table>` → `<Card className="mt-4"><div className="overflow-x-auto"><Table>` and `</Table></Card>` → `</Table></div></Card>`.

- [ ] **Step 5: Verify**

Run: `npm run lint` and `npm test`
Expected: tsc clean; 191 tests pass.

- [ ] **Step 6: Commit**

```bash
git add app/admin/page.tsx
git commit -m "refactor: localize dashboard pipeline, use formatMoney, wrap table"
```

---

### Task 7: Consolidate admin forms onto shadcn + money helper

**Files:**
- Modify: `components/admin/OrderListToolbar.tsx`
- Modify: `components/admin/ProductForm.tsx`
- Modify: `components/admin/DeliveryRuleForm.tsx`
- Modify: `components/admin/AddCityForm.tsx`
- Modify: `components/admin/SetQuantityForm.tsx`

**Interfaces:**
- Consumes: `toMinor`/`minorToEgp` (Task 1), `paymentLabel`/`fulfillmentLabel` (Task 2, for the toolbar options), shadcn `Input`/`Select`/`Field`.

- [ ] **Step 1: `OrderListToolbar.tsx`**

Rewrite as a controlled form (the `FormData` read is replaced). Full replacement:

```tsx
'use client';

import { useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useI18n } from '@/features/i18n/I18nProvider';
import { fulfillmentLabel, paymentLabel } from '@/features/admin/status-labels';

const paymentOptions = ['pending', 'payment_started', 'paid', 'payment_failed', 'cancelled', 'refunded'];
const fulfillmentOptions = ['confirmed', 'preparing', 'ready_for_delivery', 'out_for_delivery', 'delivered', 'cancelled'];

export function OrderListToolbar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { t } = useI18n();
  const [q, setQ] = useState(searchParams.get('q') ?? '');
  const [payment, setPayment] = useState(searchParams.get('payment') ?? '');
  const [fulfillment, setFulfillment] = useState(searchParams.get('fulfillment') ?? '');

  function submit() {
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    if (payment) params.set('payment', payment);
    if (fulfillment) params.set('fulfillment', fulfillment);
    router.push(`${pathname}${params.toString() ? `?${params}` : ''}`);
  }

  return <div className="my-4 grid grid-cols-[minmax(14rem,2fr)_repeat(2,1fr)_auto] items-end gap-3 max-md:grid-cols-1">
    <div className="grid gap-1.5"><span className="text-sm font-bold text-foreground">{t('adminSearch')}</span><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('adminSearchPlaceholder')} /></div>
    <div className="grid gap-1.5"><span className="text-sm font-bold text-foreground">{t('paymentFilter')}</span><Select value={payment || 'all'} onValueChange={(v) => setPayment(v === 'all' ? '' : v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t('all')}</SelectItem>{paymentOptions.map((s) => <SelectItem key={s} value={s}>{paymentLabel(s, t)}</SelectItem>)}</SelectContent></Select></div>
    <div className="grid gap-1.5"><span className="text-sm font-bold text-foreground">{t('fulfillmentFilter')}</span><Select value={fulfillment || 'all'} onValueChange={(v) => setFulfillment(v === 'all' ? '' : v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t('all')}</SelectItem>{fulfillmentOptions.map((s) => <SelectItem key={s} value={s}>{fulfillmentLabel(s, t)}</SelectItem>)}</SelectContent></Select></div>
    <Button type="button" onClick={submit}>{t('filter')}</Button>
  </div>;
}
```

- [ ] **Step 2: `ProductForm.tsx`**

Add imports: `import { Input } from '@/components/ui/input';`, `import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';`, `import { minorToEgp, toMinor } from '@/features/admin/money';`. Delete the local `toMinor`/`minorToEgp` functions and the `const selectClass`/`const fieldLabelClass` lines.

Replace the category label/select block with a `Select`:

```tsx
<div className="grid gap-1.5"><span className="text-sm font-bold text-foreground">{t('category')}</span><Select value={product.category} onValueChange={(v) => patch({ category: v })}><SelectTrigger id="category"><SelectValue /></SelectTrigger><SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div>
```

Replace the three raw `<label className={fieldLabelClass}>…<input className={selectClass} …/></label>` fields (price, tone, delivery) with `Field`:

```tsx
<Field id="price" label={t('priceEgp')} type="number" min={0} step="0.01" value={minorToEgp(product.priceMinor)} onChange={(e) => patch({ priceMinor: toMinor(e.target.value) })} required />
<Field id="tone" label={t('toneHex')} type="text" pattern="#[0-9a-fA-F]{6}" value={product.tone} onChange={(e) => patch({ tone: e.target.value })} required />
<Field id="delivery" label={t('deliveryCopy')} type="text" value={product.delivery} onChange={(e) => patch({ delivery: e.target.value })} required />
```

Add `has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring` to the occasions and active-variant checkbox labels' `className`.

- [ ] **Step 3: `DeliveryRuleForm.tsx`**

Add import: `import { Input } from '@/components/ui/input';` and `import { minorToEgp, toMinor } from '@/features/admin/money';`. Delete the local `toMinor`/`minorToEgp` and `const inputClass` lines. Replace the three raw inputs/select with `Input`/`Select`:

```tsx
<Input className="h-10 w-24" type="number" min={0} step="0.01" value={fee} onChange={(e) => setFee(e.target.value)} aria-label={t('feeEgp')} />
<Input className="h-10 w-24" type="number" min={0} step="0.01" value={minimum} onChange={(e) => setMinimum(e.target.value)} aria-label={t('minimumOrderEgp')} />
<Select value={cutoff} onValueChange={setCutoff}><SelectTrigger className="h-10 w-24" aria-label={t('cutoffHour')}><SelectValue /></SelectTrigger><SelectContent>{HOURS.map((h) => <SelectItem key={h} value={String(h)}>{h}:00</SelectItem>)}</SelectContent></Select>
```

Add `import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';`. Add `has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring` to the active checkbox label. Ensure the form uses `flex-wrap` (change `grid items-end gap-2` → `flex flex-wrap items-end gap-2`).

- [ ] **Step 4: `AddCityForm.tsx`**

Add imports: `import { Field } from '@/components/ui/field';`, `import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';`, `import { toMinor } from '@/features/admin/money';`. Delete the local `toMinor` and `const inputClass`/`const fieldLabelClass` lines. Replace the six raw label/input blocks with `Field` (code, nameEn, nameAr, fee, minimum) and the cutoff select with a `Select`:

```tsx
<Field id="code" label={t('codeLabel')} value={form.code} onChange={(e) => patch({ code: e.target.value })} placeholder="greater-cairo" required />
<Field id="nameEn" label={t('nameEn')} value={form.nameEn} onChange={(e) => patch({ nameEn: e.target.value })} required />
<Field id="nameAr" label={t('nameAr')} value={form.nameAr} onChange={(e) => patch({ nameAr: e.target.value })} required />
<Field id="fee" label={t('feeEgp')} type="number" min={0} step="0.01" value={form.fee} onChange={(e) => patch({ fee: e.target.value })} required />
<Field id="minimum" label={t('minimumOrderEgp')} type="number" min={0} step="0.01" value={form.minimum} onChange={(e) => patch({ minimum: e.target.value })} />
<div className="grid gap-1.5"><span className="text-sm font-bold text-foreground">{t('cutoffHour')}</span><Select value={form.cutoff} onValueChange={(v) => patch({ cutoff: v })}><SelectTrigger id="cutoff"><SelectValue /></SelectTrigger><SelectContent>{HOURS.map((h) => <SelectItem key={h} value={String(h)}>{h}:00</SelectItem>)}</SelectContent></Select></div>
```

Add `has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring` to the sameDay checkbox label.

- [ ] **Step 5: `SetQuantityForm.tsx`**

Add import: `import { Input } from '@/components/ui/input';`. Replace the raw `<input className="h-10 w-20 rounded-[10px] …" …/>` with `<Input className="h-10 w-20" type="number" min={0} value={value} onChange={(e) => setValue(e.target.value)} aria-label={t('setQuantity')} />`.

- [ ] **Step 6: Verify**

Run: `npm run lint` and `npm test`
Expected: tsc clean; 191 tests pass.

- [ ] **Step 7: Commit**

```bash
git add components/admin/OrderListToolbar.tsx components/admin/ProductForm.tsx components/admin/DeliveryRuleForm.tsx components/admin/AddCityForm.tsx components/admin/SetQuantityForm.tsx
git commit -m "refactor: consolidate admin forms onto shadcn and shared money helper"
```

---

### Task 8: Inventory variant name + table overflow + promos sidebar icon

**Files:**
- Modify: `app/admin/inventory/page.tsx`
- Modify: `components/admin/AppSidebar.tsx`

- [ ] **Step 1: `app/admin/inventory/page.tsx`**

Change the query to embed the variant name: `.from('inventory').select('variant_id,quantity,reserved_quantity,updated_at,product_variants(name_en)')`. Update the row type to `{ variant_id: string; quantity: number; reserved_quantity: number; product_variants?: { name_en: string } | null }` and render `<TableCell className="font-medium">{row.product_variants?.name_en ?? row.variant_id}</TableCell>` instead of `<TableCell className="font-medium">{row.variant_id}</TableCell>`.

Wrap the table: change `<Card className="mt-6"><Table>` → `<Card className="mt-6"><div className="overflow-x-auto"><Table>` and `</Table></Card>` → `</Table></div></Card>`.

- [ ] **Step 2: `components/admin/AppSidebar.tsx`**

Add `Ticket` to the lucide import and the `/admin/promos` entry: `'/admin/promos': Ticket,`.

- [ ] **Step 3: Verify**

Run: `npm run lint` and `npm test`
Expected: tsc clean; 191 tests pass.

- [ ] **Step 4: Commit**

```bash
git add app/admin/inventory/page.tsx components/admin/AppSidebar.tsx
git commit -m "feat: show inventory variant names and add promos sidebar icon"
```

---

### Task 9: Final verification gate

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: 191 tests pass, 0 failures.

- [ ] **Step 2: Typecheck**

Run: `npm run lint` (maps to `tsc --noEmit`)
Expected: clean.

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: builds without errors.

- [ ] **Step 4: Diff hygiene**

Run: `git diff --check` and `git diff --stat`
Expected: no whitespace errors; only the admin files listed above changed.

- [ ] **Step 5: Secret scan**

Run: `npm test -- tests/security/no-secrets.test.ts`
Expected: PASS.

- [ ] **Step 6: Whole-branch review**

Review the full diff: confirm no storefront/API-route/data-model files changed, no new dependencies, no leftover legacy classes (`.eyebrow`, `.admin-table`, `.checkout-form`, `.field`, `.button`, `.quantity-control`, `inputClass`, `selectClass`, `fieldLabelClass`) in admin files, and all statuses render via `paymentLabel`/`fulfillmentLabel`.

---

## Self-Review Notes

- **Spec coverage:** Section 1 → Tasks 2–3 + 5–6; Section 2 → Tasks 5–6, 8; Section 3 → Task 4; Section 4 → Tasks 1, 6–8; Section 5 → Tasks 3, 6; Section 6 → Tasks 1–3 tests + Task 9 gate. All covered.
- **Placeholders:** none — every step has concrete code or a concrete command.
- **Type consistency:** `toMinor`/`minorToEgp` (Task 1) match Task 4/7 imports; `fulfillmentBadgeVariant`/`paymentBadgeVariant`/`*Label` (Task 2) match Tasks 5–7 usage; `BadgeTone` union members match the `success`/`warning` variants added in Task 3.
