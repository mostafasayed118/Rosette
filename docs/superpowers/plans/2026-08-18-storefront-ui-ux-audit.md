# Storefront UI/UX + Responsive Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the concrete UI/UX, accessibility, responsiveness, and consistency defects in the customer storefront, without a visual redesign.

**Architecture:** A series of small, independently-testable fixes: pure date/label helpers, `next/image` in the shared `ProductVisual`, a mobile `Sheet` menu + larger touch targets in `SiteHeader`, consolidation of the duplicated form controls onto the existing shadcn `Input`/`Select`/`Textarea`, and page-level hero/focus fixes. No new dependencies, no data-model changes.

**Tech Stack:** Next.js 16 (App Router), React 19, Tailwind CSS v4, shadcn/ui (Radix primitives), TypeScript, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-08-18-storefront-ui-ux-audit-design.md`

## Global Constraints

- No new dependencies; use the shadcn components already in `components/ui` (`Input`, `Select`, `Textarea`, `Sheet`, `Label`).
- No visual redesign: tokens, fonts, colors, and page structure are unchanged.
- Customer storefront only — do not touch admin pages, API routes, or the data model.
- Trilingual: any new UI string MUST be added to all three locales (`en`, `ar`, `fr`) in `features/i18n/dictionaries.ts`; the `i18n-dictionary.test.ts` completeness test enforces `ar`/`fr` ⊇ `en`.
- TDD: write the failing test first, confirm red, implement, confirm green, commit per task.
- Date strings use local time, format `YYYY-MM-DD`.
- Baseline test count: 169. Expected final: 179 (10 new).

---

### Task 1: Dynamic delivery date helpers

**Files:**
- Create: `features/delivery/dates.ts`
- Create: `tests/domain/delivery-dates.test.ts`

**Interfaces:**
- Produces: `minDeliveryDate(now: Date): string` and `defaultDeliveryDate(now: Date): string` (both `YYYY-MM-DD`, local time). Consumed by `ProductDetail.tsx` and `CheckoutForm.tsx` in Task 6.

- [ ] **Step 1: Write the failing test**

Create `tests/domain/delivery-dates.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { defaultDeliveryDate, minDeliveryDate } from '@/features/delivery/dates';

describe('delivery dates', () => {
  it('minDeliveryDate returns today in local YYYY-MM-DD', () => {
    expect(minDeliveryDate(new Date(2026, 7, 18))).toBe('2026-08-18');
  });

  it('defaultDeliveryDate returns today + 2 days', () => {
    expect(defaultDeliveryDate(new Date(2026, 7, 18))).toBe('2026-08-20');
  });

  it('pads month and day and rolls across month boundaries', () => {
    expect(minDeliveryDate(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(defaultDeliveryDate(new Date(2026, 0, 30))).toBe('2026-02-01');
  });

  it('rolls across the year boundary', () => {
    expect(defaultDeliveryDate(new Date(2026, 11, 31))).toBe('2027-01-02');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/domain/delivery-dates.test.ts`
Expected: FAIL — cannot resolve `@/features/delivery/dates`.

- [ ] **Step 3: Write the minimal implementation**

Create `features/delivery/dates.ts`:

```ts
function toLocalISO(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function minDeliveryDate(now: Date): string {
  return toLocalISO(now);
}

export function defaultDeliveryDate(now: Date): string {
  const date = new Date(now);
  date.setDate(date.getDate() + 2);
  return toLocalISO(date);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/domain/delivery-dates.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add features/delivery/dates.ts tests/domain/delivery-dates.test.ts
git commit -m "feat: add dynamic delivery date helpers"
```

---

### Task 2: Add-on label helper

**Files:**
- Create: `features/catalog/add-on-labels.ts`
- Create: `tests/domain/add-on-labels.test.ts`

**Interfaces:**
- Produces: `addOnLabel(item: { id: string; name: string }, t: (key: string) => string): string`. Consumed by `ProductDetail.tsx` and `CartLineItem.tsx` in Task 5.

- [ ] **Step 1: Write the failing test**

Create `tests/domain/add-on-labels.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { addOnLabel } from '@/features/catalog/add-on-labels';

const t = (key: string) => key;

describe('addOnLabel', () => {
  it('maps note to the handwrittenNote key', () => {
    expect(addOnLabel({ id: 'note', name: 'Note' }, t)).toBe('handwrittenNote');
  });

  it('maps chocolate to the darkChocolate key', () => {
    expect(addOnLabel({ id: 'chocolate', name: 'Chocolate' }, t)).toBe('darkChocolate');
  });

  it('maps balloon to the balloon key', () => {
    expect(addOnLabel({ id: 'balloon', name: 'Balloon' }, t)).toBe('balloon');
  });

  it('falls back to the item name for unknown ids', () => {
    expect(addOnLabel({ id: 'vase', name: 'Glass vase' }, t)).toBe('Glass vase');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/domain/add-on-labels.test.ts`
Expected: FAIL — cannot resolve `@/features/catalog/add-on-labels`.

- [ ] **Step 3: Write the minimal implementation**

Create `features/catalog/add-on-labels.ts`:

```ts
type AddOnLike = { id: string; name: string };

export function addOnLabel(item: AddOnLike, t: (key: string) => string): string {
  if (item.id === 'note') return t('handwrittenNote');
  if (item.id === 'chocolate') return t('darkChocolate');
  if (item.id === 'balloon') return t('balloon');
  return item.name;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/domain/add-on-labels.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add features/catalog/add-on-labels.ts tests/domain/add-on-labels.test.ts
git commit -m "feat: extract add-on label helper"
```

---

### Task 3: `next/image` in `ProductVisual` + remote patterns

**Files:**
- Modify: `components/ui/ProductVisual.tsx`
- Modify: `next.config.ts`
- Test: `tests/components/ProductVisual.test.tsx`

**Interfaces:**
- Consumes: none new.
- Produces: `ProductVisual` now accepts an optional `sizes?: string` prop (default `'100vw'`) and renders `next/image` (fill) with `alt={label}` when `imageUrl` is set; the bloom fallback (no `img` element) is unchanged when `imageUrl` is absent.

- [ ] **Step 1: Update the failing test**

Replace `tests/components/ProductVisual.test.tsx` with:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProductVisual } from '@/components/ui/ProductVisual';

vi.mock('next/image', () => ({
  default: ({ src, alt, fill, sizes, priority, className, ...rest }: any) => (
    <img src={src} alt={alt} className={className} {...rest} />
  ),
}));

describe('ProductVisual', () => {
  it('renders the photo with alt text when imageUrl is provided', () => {
    render(<ProductVisual tone="#c2456d" label="Rose Hour photo" imageUrl="https://example.com/rose.jpg" />);
    const img = screen.getByRole('img', { name: 'Rose Hour photo' });
    expect(img).toHaveAttribute('src', 'https://example.com/rose.jpg');
  });

  it('renders the placeholder when imageUrl is null', () => {
    render(<ProductVisual tone="#c2456d" label="Rose Hour visual" />);
    const visual = screen.getByRole('img', { name: 'Rose Hour visual' });
    expect(visual.querySelector('.visual-bloom')).toBeInTheDocument();
    expect(visual.querySelector('img')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/components/ProductVisual.test.tsx`
Expected: FAIL — the image case has no `alt`-bearing `<img>` (the wrapper still uses `role="img"` on a `<div>` and the old test's `loading="lazy"` assertion no longer applies).

- [ ] **Step 3: Write the implementation**

Replace the body of `components/ui/ProductVisual.tsx`:

```tsx
import Image from 'next/image';
import type { CSSProperties } from 'react';

type ProductVisualProps = { tone: string; label: string; compact?: boolean; imageUrl?: string | null; className?: string; sizes?: string };

export function ProductVisual({ tone, label, compact = false, imageUrl, className = '', sizes = '100vw' }: ProductVisualProps) {
  const minHeight = className.includes('min-h') ? '' : (compact ? 'min-h-[190px]' : 'min-h-[480px]');
  const bloomSize = compact ? 'text-[3.5rem]' : 'text-[7rem]';
  if (imageUrl) {
    return <div className={`relative grid place-items-center overflow-hidden rounded-2xl ${minHeight} ${className}`}><Image src={imageUrl} alt={label} fill sizes={sizes} className="object-cover" /></div>;
  }
  return <div className={`relative grid place-items-center overflow-hidden rounded-2xl ${minHeight} ${className}`} style={{ '--visual-tone': tone, background: 'color-mix(in srgb, var(--visual-tone) 25%, var(--color-surface))' } as CSSProperties} role="img" aria-label={label}><span className={`visual-bloom ${bloomSize} text-primary`} aria-hidden="true">✦</span></div>;
}
```

Then update `next.config.ts` to add remote image patterns:

```ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: '**.supabase.co' },
    ],
  },
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/components/ProductVisual.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add components/ui/ProductVisual.tsx next.config.ts tests/components/ProductVisual.test.tsx
git commit -m "feat: use next/image in ProductVisual with remote patterns"
```

---

### Task 4: `SiteHeader` mobile menu + touch targets

**Files:**
- Modify: `components/layout/SiteHeader.tsx`
- Modify: `components/layout/LanguageToggle.tsx`
- Modify: `features/i18n/dictionaries.ts` (add `menu` key to `en`, `ar`, `fr`)
- Test: `tests/components/SiteHeader.test.tsx`

**Interfaces:**
- Consumes: existing `Sheet` components, `LanguageToggle`, `useCart`/`useI18n`/`useTheme`.
- Produces: `SiteHeader` renders an inline desktop nav (≥ `md`) and a hamburger-triggered `Sheet` menu (mobile) with the same destinations; header controls are ≥ 44px.

- [ ] **Step 1: Add the `menu` i18n key to all three locales**

In `features/i18n/dictionaries.ts`, add `menu: 'Menu',` to the `en` object, `menu: 'القائمة',` to the `ar` object, and `menu: 'Menu',` to the `fr` object (place next to `language`). The completeness test will fail if any locale is missed.

- [ ] **Step 2: Write the failing test**

Create `tests/components/SiteHeader.test.tsx`:

```tsx
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { CartProvider } from '@/features/cart/CartProvider';
import { renderWithProviders } from '../test-utils';

describe('SiteHeader', () => {
  it('renders shop, track, and bag links', () => {
    renderWithProviders(<CartProvider><SiteHeader /></CartProvider>);
    expect(screen.getAllByRole('link', { name: /shop the collection/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /track order/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /bag/i }).length).toBeGreaterThan(0);
  });

  it('opens the mobile menu with navigation and controls', async () => {
    renderWithProviders(<CartProvider><SiteHeader /></CartProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('link', { name: /shop the collection/i })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Toggle theme' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- tests/components/SiteHeader.test.tsx`
Expected: FAIL — no "Menu" button exists (the current header has no hamburger or `Sheet`).

- [ ] **Step 4: Write the implementation**

Replace `components/layout/SiteHeader.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { Menu, Moon, Sun } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { useCart } from '@/features/cart/CartProvider';
import { LanguageToggle } from './LanguageToggle';
import { useI18n } from '@/features/i18n/I18nProvider';
import { useTheme } from '@/features/theme/ThemeProvider';

type SiteHeaderProps = { cityName?: string; cartCount?: number; onDestinationChange?: () => void };

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return (
    <button type="button" className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-accent" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label="Toggle theme">
      {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </button>
  );
}

export function SiteHeader({ cityName, cartCount, onDestinationChange }: SiteHeaderProps) {
  const cart = useCart();
  const { t } = useI18n();
  const count = cartCount ?? (cart.ready ? cart.itemCount : 0);
  const bag = (
    <Link className="flex items-center gap-2" href="/cart">{t('bag')} <span className="grid h-6 min-w-6 place-items-center rounded-full bg-primary px-1.5 text-xs text-primary-foreground">{count}</span></Link>
  );
  return (
    <header className="mx-auto flex w-[min(calc(100%-3rem),80rem)] items-center justify-between gap-4 py-5">
      <Link className="font-display text-3xl tracking-tight text-primary" href="/">Rosette</Link>
      <nav className="hidden items-center gap-5 text-sm md:flex" aria-label="Main navigation">
        <Link href="/shop">{t('shop')}</Link>
        <Link href="/track">{t('trackOrder')}</Link>
        <button className="bg-transparent p-0 text-sm text-muted-foreground" type="button" onClick={onDestinationChange}>{cityName ? t('deliveringTo', { city: cityName }) : t('chooseDestination')}</button>
        {bag}
        <LanguageToggle />
        <ThemeToggle />
      </nav>
      <div className="flex items-center gap-2 md:hidden">
        {bag}
        <Sheet>
          <SheetTrigger asChild>
            <button type="button" className="grid h-11 w-11 place-items-center rounded-full text-foreground hover:bg-accent" aria-label={t('menu')}><Menu className="h-5 w-5" /></button>
          </SheetTrigger>
          <SheetContent side="right">
            <SheetHeader><SheetTitle>{t('menu')}</SheetTitle></SheetHeader>
            <nav className="grid gap-1 p-4" aria-label="Mobile navigation">
              <Link className="rounded-xl px-4 py-3 hover:bg-accent" href="/shop">{t('shop')}</Link>
              <Link className="rounded-xl px-4 py-3 hover:bg-accent" href="/track">{t('trackOrder')}</Link>
              <button className="rounded-xl px-4 py-3 text-left hover:bg-accent" type="button" onClick={onDestinationChange}>{cityName ? t('deliveringTo', { city: cityName }) : t('chooseDestination')}</button>
              <div className="flex items-center justify-between rounded-xl px-2 py-2"><LanguageToggle /><ThemeToggle /></div>
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
```

Update `components/layout/LanguageToggle.tsx` so its button is ≥ 44px tall and keyboard-friendly (replace its `className` with `"grid h-11 min-w-11 place-items-center rounded-full px-2 text-xs font-bold text-primary hover:bg-accent"`).

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- tests/components/SiteHeader.test.tsx`
Expected: PASS (2 tests). Also run `npm test -- tests/domain/i18n-dictionary.test.ts tests/components/HomePage.test.tsx` to confirm the dictionary stays complete and the existing header reset flow still works.

- [ ] **Step 6: Commit**

```bash
git add components/layout/SiteHeader.tsx components/layout/LanguageToggle.tsx features/i18n/dictionaries.ts tests/components/SiteHeader.test.tsx
git commit -m "feat: add mobile menu and larger touch targets to site header"
```

---

### Task 5: Consolidate form controls + reuse the add-on helper

**Files:**
- Modify: `features/checkout/CheckoutForm.tsx`
- Modify: `app/track/page.tsx`
- Modify: `features/product/ProductDetail.tsx`
- Modify: `features/cart/CartLineItem.tsx`

**Interfaces:**
- Consumes: `addOnLabel` (Task 2), shadcn `Input`/`Select`/`Textarea`.
- Produces: no new public interfaces. Behavior is unchanged; only the controls are swapped to shared components and the duplicated class constants/`addOnLabel` logic are removed.

- [ ] **Step 1: `CheckoutForm.tsx` — swap raw controls for `Select`/`Input`**

Add imports: `import { Input } from '@/components/ui/input';` and `import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';`. Delete the `const selectClass = ...` line.

Replace the delivery-window label block:

```tsx
<label className="grid gap-1.5"><span className="text-sm font-bold text-foreground">{t('deliveryWindow')}</span><select id="deliveryWindow" className={selectClass} value={input.deliveryWindow} onChange={(event) => update('deliveryWindow', event.target.value)}><option value="12-3">12:00–15:00</option><option value="3-6">15:00–18:00</option><option value="6-9">18:00–21:00</option></select>{errors.deliveryWindow ? <small className="text-sm text-destructive">{errors.deliveryWindow}</small> : null}</label>
```

with:

```tsx
<div className="grid gap-1.5"><span className="text-sm font-bold text-foreground">{t('deliveryWindow')}</span><Select value={input.deliveryWindow} onValueChange={(value) => update('deliveryWindow', value)}><SelectTrigger id="deliveryWindow"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="12-3">12:00–15:00</SelectItem><SelectItem value="3-6">15:00–18:00</SelectItem><SelectItem value="6-9">18:00–21:00</SelectItem></SelectContent></Select>{errors.deliveryWindow ? <small className="text-sm text-destructive">{errors.deliveryWindow}</small> : null}</div>
```

Replace the payment-method label block:

```tsx
<label className="grid gap-1.5"><span className="text-sm font-bold text-foreground">{t('paymentMethod')}</span><select className={selectClass} value={input.paymentMethod} onChange={(event) => update('paymentMethod', event.target.value as CheckoutInput['paymentMethod'])}><option value="paymob">{t('paymob')}</option><option value="pay-on-delivery">{t('payDelivery')}</option><option value="demo-card">{t('demoCard')}</option></select></label>
```

with:

```tsx
<div className="grid gap-1.5"><span className="text-sm font-bold text-foreground">{t('paymentMethod')}</span><Select value={input.paymentMethod} onValueChange={(value) => update('paymentMethod', value as CheckoutInput['paymentMethod'])}><SelectTrigger id="paymentMethod"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="paymob">{t('paymob')}</SelectItem><SelectItem value="pay-on-delivery">{t('payDelivery')}</SelectItem><SelectItem value="demo-card">{t('demoCard')}</SelectItem></SelectContent></Select></div>
```

Replace the promo `<input type="text" ... className="h-11 flex-1 rounded-[10px] border border-border bg-background px-3.5 text-foreground" />` with `<Input type="text" value={promo.code} onChange={(event) => promo.setCode(event.target.value)} aria-label={t('promoCode')} />`.

- [ ] **Step 2: `app/track/page.tsx` — swap raw inputs for `Input`**

Add `import { Input } from '@/components/ui/input';`. Delete the `const inputClass = ...` line. Replace the two `<input className={inputClass} ... />` elements (order number and email) with `<Input type="text" name="number" defaultValue={number ?? ''} required />` and `<Input type="email" name="email" defaultValue={email ?? ''} required />`.

- [ ] **Step 3: `ProductDetail.tsx` — use `Textarea` + the add-on helper**

Add imports: `import { Textarea } from '@/components/ui/textarea';` and `import { addOnLabel } from '@/features/catalog/add-on-labels';`. Delete the inline `function addOnLabel(item) {...}` and replace its use `{addOnLabel(item)}` with `{addOnLabel(item, t)}`. Replace the raw `<textarea id="message" ... className="min-h-24 w-full resize-y rounded-[10px] border border-border bg-background px-3.5 py-2.5 text-foreground" />` with `<Textarea id="message" maxLength={160} value={message} onChange={(event) => setMessage(event.target.value)} placeholder={t('notePlaceholder')} className="min-h-24" />`.

- [ ] **Step 4: `CartLineItem.tsx` — use the add-on helper**

Add `import { addOnLabel } from '@/features/catalog/add-on-labels';`. Delete the local `function addOnLabel(...)` and change `addOnLabels` to `line.addOns.map((addOn) => addOnLabel(addOn, t))`.

- [ ] **Step 5: Verify**

Run: `npm run lint` (tsc) and `npm test`
Expected: tsc clean; 179 tests pass (169 existing + 4 dates + 4 labels + 2 header).

- [ ] **Step 6: Commit**

```bash
git add features/checkout/CheckoutForm.tsx app/track/page.tsx features/product/ProductDetail.tsx features/cart/CartLineItem.tsx
git commit -m "refactor: use shared Input/Select/Textarea and add-on helper"
```

---

### Task 6: Hero scale, dead caption removal, choice-card focus rings

**Files:**
- Modify: `app/page.tsx`
- Modify: `features/product/ProductDetail.tsx`
- Modify: `features/checkout/CheckoutForm.tsx`
- Modify: `features/checkout/CheckoutForm.tsx` and `features/product/ProductDetail.tsx` — wire dynamic dates (from Task 1)

**Interfaces:**
- Consumes: `minDeliveryDate`/`defaultDeliveryDate` (Task 1).
- Produces: no new public interfaces. Removes the stale date literals and dead hero caption; adds visible focus to choice cards.

- [ ] **Step 1: `app/page.tsx` — scale hero and remove the dead caption**

Change the hero `<section className="mx-auto grid ... min-h-[620px] ...">` to use `md:min-h-[620px] max-md:min-h-[400px]`. Change the hero `ProductVisual`'s `className="min-h-[520px] w-full"` to `"min-h-[520px] max-md:min-h-[360px] w-full"`. Delete the trailing block:

```tsx
<div className="flex justify-between pt-3 text-xs uppercase tracking-[.1em] text-muted-foreground"><span>01 / 04</span><span>Quietly memorable</span></div>
```

- [ ] **Step 2: Wire dynamic dates**

In `features/product/ProductDetail.tsx`, replace `useState('2026-08-20')` for `deliveryDate` with `useState(defaultDeliveryDate(new Date()))`, and change the `Field`'s `min="2026-08-17"` to `min={minDeliveryDate(new Date())}`.

In `features/checkout/CheckoutForm.tsx`, replace `deliveryDate: '2026-08-20'` in `initialInput` with `deliveryDate: defaultDeliveryDate(new Date())`, and change the delivery-date `Field`'s `min="2026-08-17"` to `min={minDeliveryDate(new Date())}`. Import both helpers from `@/features/delivery/dates`.

- [ ] **Step 3: Choice-card focus rings**

In `features/product/ProductDetail.tsx`, change `choiceClass` to append ` has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring`:

```ts
const choiceClass = 'flex items-center gap-3 rounded-2xl border border-border bg-card p-4 transition-colors has-[:checked]:border-primary has-[:checked]:bg-accent has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring';
```

In `features/checkout/CheckoutForm.tsx`, add the same `has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring` to the "simulate failure" label's `className` (`flex items-center gap-3 rounded-2xl border border-border bg-card p-4`).

- [ ] **Step 4: Verify**

Run: `npm run lint` and `npm test`
Expected: tsc clean; 179 tests pass. Confirm `app/page.tsx` no longer contains `01 / 04`.

- [ ] **Step 5: Commit**

```bash
git add app/page.tsx features/product/ProductDetail.tsx features/checkout/CheckoutForm.tsx
git commit -m "fix: scale hero on mobile, remove dead caption, add choice focus rings"
```

---

### Task 7: Final verification gate

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: 179 tests pass, 0 failures.

- [ ] **Step 2: Typecheck**

Run: `npm run lint` (maps to `tsc --noEmit`)
Expected: clean.

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: builds without errors; `/` and `/shop` are in the output routes.

- [ ] **Step 4: Diff hygiene**

Run: `git diff --check` and `git diff --stat`
Expected: no whitespace errors; only the files listed in Tasks 1–6 changed.

- [ ] **Step 5: Secret scan**

Run: `npm test -- tests/security/no-secrets.test.ts`
Expected: PASS.

- [ ] **Step 6: Whole-branch review**

Review the full diff: confirm no admin/backend/data-model files changed, no new dependencies added to `package.json`, all three locale objects contain the `menu` key, and no leftover `selectClass`/`inputClass` constants or hardcoded `2026-08-` dates remain.

---

## Self-Review Notes

- **Spec coverage:** Section 1 → Tasks 1–3, 5; Section 2 → Task 4; Section 3 → Task 6; Section 4 → Tasks 1–4 tests + Task 7 gate. All covered.
- **Placeholders:** none — every step has concrete code or a concrete command.
- **Type consistency:** `minDeliveryDate`/`defaultDeliveryDate` (Task 1) match the imports in Task 6; `addOnLabel` (Task 2) matches Task 5 usage; `sizes` prop (Task 3) is additive and defaulted.
