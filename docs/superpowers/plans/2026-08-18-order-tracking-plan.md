# Customer Order Tracking Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A public trilingual `/track` page where a customer enters their order number + checkout email and sees their order: statuses, delivery info, items with prices and add-ons, totals, and a fulfillment timeline.

**Architecture:** A fail-closed `lookupOrder(client, { number, email })` service (+ pure `buildTimeline` helper) in `features/tracking/lookup-order.ts`; the `/track` server component renders a GET lookup form and the results below, using `getServerT()` for trilingual text and `formatMoney` for prices. A "Track order" link goes in the storefront header.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Supabase (postgrest-js), Vitest, `@/` path alias.

**Spec:** `docs/superpowers/specs/2026-08-18-order-tracking-design.md`

## Global Constraints

- TypeScript strict; `npm run lint` runs `tsc --noEmit` and must pass.
- Vitest for tests; new tests live in `tests/domain/*.test.ts`; `@/` resolves to repo root.
- Money is in minor units (piasters); display via `formatMoney(minor, locale)` from `@/features/money`.
- Trilingual: new UI strings must be added to all three locale dictionaries (`features/i18n/dictionaries.ts`); the existing `tests/domain/i18n-dictionary.test.ts` enforces `ar`/`fr` ⊇ `en` keys.
- Server text comes from `getServerT()` (`features/i18n/server.ts` — cookie-based translator returning `{ locale, t }`).
- The lookup is **fail-closed**: wrong number, wrong email, and DB errors all return `null`. Never surface which field was wrong.
- `PaymentStatus`/`FulfillmentStatus` types come from `@/features/commerce/order-state`.
- The page is public — use `getAdminSupabase()` (`@/lib/supabase/admin`, service role) for the lookup.
- No secrets in code or tests; tests use fakes only, never live services.
- TDD: failing test → run (red) → implement → run (green) → commit.
- All 121 existing tests stay passing.

---

### Task 1: `lookupOrder` service and `buildTimeline` helper

**Files:**
- Create: `features/tracking/lookup-order.ts`
- Test: `tests/domain/lookup-order.test.ts`

**Interfaces:**
- Consumes: `PaymentStatus`, `FulfillmentStatus` from `@/features/commerce/order-state`.
- Produces:
  - `export type TrackedOrder = { number: string; paymentStatus: PaymentStatus; fulfillmentStatus: FulfillmentStatus; recipientName: string; deliveryCityCode: string; deliveryDate: string; deliveryWindow: string; subtotalMinor: number; deliveryFeeMinor: number; totalMinor: number; items: Array<{ nameEn: string; nameAr: string; quantity: number; unitPriceMinor: number; addOns: Array<{ nameEn: string; nameAr: string; priceMinor: number }> }>; timeline: Array<{ status: FulfillmentStatus; at: string }> }`
  - `buildTimeline(events: Array<{ to_status: string | null; created_at: string }>): Array<{ status: FulfillmentStatus; at: string }>` — drops events whose `to_status` isn't a fulfillment status, sorts ascending by `created_at`, maps to `{ status, at }`
  - `lookupOrder(client: { from: (table: string) => any }, input: { number: string; email: string }): Promise<TrackedOrder | null>` — queries `orders` by `display_number` + `customer_email` with embedded `order_items` (incl. `add_ons`) and `order_events` (`to_status`, `created_at`); maps to `TrackedOrder`; **returns `null` on no row, DB error, or throw**.

- [ ] **Step 1: Write the failing test**

`tests/domain/lookup-order.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildTimeline, lookupOrder, type TrackedOrder } from '@/features/tracking/lookup-order';

type Call = { column: string; value: string };

function fakeClient(seed: { order?: Record<string, unknown> | null; error?: boolean }) {
  const calls: Call[] = [];
  const from = (table: string) => ({
    select: () => ({
      eq: (column: string, value: string) => {
        calls.push({ column, value });
        return {
          eq: (column2: string, value2: string) => {
            calls.push({ column: column2, value: value2 });
            return {
              maybeSingle: async () => (seed.error ? { data: null, error: { message: 'db down' } } : { data: seed.order ?? null, error: null }),
            };
          },
        };
      },
    }),
  });
  return { client: { from }, calls };
}

const orderRow = {
  display_number: 'RO-1024',
  customer_email: 'buyer@example.com',
  recipient_name: 'Sara',
  delivery_city_code: 'cairo',
  delivery_date: '2026-08-20',
  delivery_window: '12:00–16:00',
  payment_status: 'paid',
  fulfillment_status: 'out_for_delivery',
  subtotal_minor: 12000,
  delivery_fee_minor: 7500,
  total_minor: 19500,
  order_items: [{ product_name_en: 'Rose Hour', product_name_ar: 'ساعة الورد', quantity: 1, unit_price_minor: 12000, add_ons: [{ id: 'note', name_en: 'Handwritten note', name_ar: 'بطاقة', price_minor: 500 }] }],
  order_events: [
    { event_type: 'payment', from_status: null, to_status: null, created_at: '2026-08-18T08:00:00Z' },
    { event_type: 'status_change', from_status: 'confirmed', to_status: 'preparing', created_at: '2026-08-18T09:00:00Z' },
    { event_type: 'status_change', from_status: 'preparing', to_status: 'out_for_delivery', created_at: '2026-08-19T10:00:00Z' },
  ],
};

describe('lookupOrder', () => {
  it('maps a matching order into the TrackedOrder shape', async () => {
    const { client } = fakeClient({ order: orderRow });
    const result = await lookupOrder(client, { number: 'RO-1024', email: 'buyer@example.com' });
    expect(result).not.toBeNull();
    expect(result!.number).toBe('RO-1024');
    expect(result!.paymentStatus).toBe('paid');
    expect(result!.fulfillmentStatus).toBe('out_for_delivery');
    expect(result!.recipientName).toBe('Sara');
    expect(result!.deliveryDate).toBe('2026-08-20');
    expect(result!.deliveryWindow).toBe('12:00–16:00');
    expect(result!.subtotalMinor).toBe(12000);
    expect(result!.deliveryFeeMinor).toBe(7500);
    expect(result!.totalMinor).toBe(19500);
    expect(result!.items).toEqual([{ nameEn: 'Rose Hour', nameAr: 'ساعة الورد', quantity: 1, unitPriceMinor: 12000, addOns: [{ nameEn: 'Handwritten note', nameAr: 'بطاقة', priceMinor: 500 }] }]);
  });

  it('builds the timeline from fulfillment transitions only, sorted ascending', async () => {
    const { client } = fakeClient({ order: orderRow });
    const result = (await lookupOrder(client, { number: 'RO-1024', email: 'buyer@example.com' })) as TrackedOrder;
    expect(result.timeline).toEqual([
      { status: 'preparing', at: '2026-08-18T09:00:00Z' },
      { status: 'out_for_delivery', at: '2026-08-19T10:00:00Z' },
    ]);
  });

  it('queries by display_number and customer_email', async () => {
    const { client, calls } = fakeClient({ order: orderRow });
    await lookupOrder(client, { number: 'RO-1024', email: 'buyer@example.com' });
    expect(calls).toEqual([
      { column: 'display_number', value: 'RO-1024' },
      { column: 'customer_email', value: 'buyer@example.com' },
    ]);
  });

  it('returns null for a valid number with the wrong email', async () => {
    const { client } = fakeClient({ order: null });
    expect(await lookupOrder(client, { number: 'RO-1024', email: 'wrong@example.com' })).toBeNull();
  });

  it('returns null for an unknown number', async () => {
    const { client } = fakeClient({ order: null });
    expect(await lookupOrder(client, { number: 'RO-9999', email: 'buyer@example.com' })).toBeNull();
  });

  it('returns null on a database error', async () => {
    const { client } = fakeClient({ order: orderRow, error: true });
    expect(await lookupOrder(client, { number: 'RO-1024', email: 'buyer@example.com' })).toBeNull();
  });
});

describe('buildTimeline', () => {
  it('drops events whose to_status is not a fulfillment status', () => {
    const events = [
      { to_status: null, created_at: '2026-08-18T08:00:00Z' },
      { to_status: 'paid', created_at: '2026-08-18T08:30:00Z' },
      { to_status: 'preparing', created_at: '2026-08-18T09:00:00Z' },
    ];
    expect(buildTimeline(events)).toEqual([{ status: 'preparing', at: '2026-08-18T09:00:00Z' }]);
  });

  it('sorts ascending by created_at and keeps cancelled', () => {
    const events = [
      { to_status: 'delivered', created_at: '2026-08-19T10:00:00Z' },
      { to_status: 'cancelled', created_at: '2026-08-18T11:00:00Z' },
      { to_status: 'confirmed', created_at: '2026-08-18T09:00:00Z' },
    ];
    expect(buildTimeline(events)).toEqual([
      { status: 'confirmed', at: '2026-08-18T09:00:00Z' },
      { status: 'cancelled', at: '2026-08-18T11:00:00Z' },
      { status: 'delivered', at: '2026-08-19T10:00:00Z' },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/domain/lookup-order.test.ts`
Expected: FAIL — module `@/features/tracking/lookup-order` not found.

- [ ] **Step 3: Implement**

`features/tracking/lookup-order.ts`:

```ts
import type { FulfillmentStatus, PaymentStatus } from '@/features/commerce/order-state';

export type TrackedOrder = {
  number: string;
  paymentStatus: PaymentStatus;
  fulfillmentStatus: FulfillmentStatus;
  recipientName: string;
  deliveryCityCode: string;
  deliveryDate: string;
  deliveryWindow: string;
  subtotalMinor: number;
  deliveryFeeMinor: number;
  totalMinor: number;
  items: Array<{ nameEn: string; nameAr: string; quantity: number; unitPriceMinor: number; addOns: Array<{ nameEn: string; nameAr: string; priceMinor: number }> }>;
  timeline: Array<{ status: FulfillmentStatus; at: string }>;
};

type LookupClient = { from: (table: string) => any };

type EventRow = { to_status: string | null; created_at: string };
type ItemRow = { product_name_en: string; product_name_ar: string; quantity: number; unit_price_minor: number; add_ons?: Array<{ name_en: string; name_ar: string; price_minor: number }> };

const FULFILLMENT_STATUSES: FulfillmentStatus[] = ['confirmed', 'preparing', 'ready_for_delivery', 'out_for_delivery', 'delivered', 'cancelled'];

export function buildTimeline(events: EventRow[]): Array<{ status: FulfillmentStatus; at: string }> {
  return events
    .filter((event): event is EventRow & { to_status: FulfillmentStatus } => FULFILLMENT_STATUSES.includes(event.to_status as FulfillmentStatus))
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .map((event) => ({ status: event.to_status, at: event.created_at }));
}

export async function lookupOrder(client: LookupClient, input: { number: string; email: string }): Promise<TrackedOrder | null> {
  try {
    const { data, error } = await client
      .from('orders')
      .select('display_number,customer_email,recipient_name,delivery_city_code,delivery_date,delivery_window,payment_status,fulfillment_status,subtotal_minor,delivery_fee_minor,total_minor,order_items(product_name_en,product_name_ar,quantity,unit_price_minor,add_ons),order_events(to_status,created_at)')
      .eq('display_number', input.number)
      .eq('customer_email', input.email)
      .maybeSingle();
    if (error || !data) return null;
    return {
      number: data.display_number,
      paymentStatus: data.payment_status,
      fulfillmentStatus: data.fulfillment_status,
      recipientName: data.recipient_name,
      deliveryCityCode: data.delivery_city_code,
      deliveryDate: data.delivery_date,
      deliveryWindow: data.delivery_window,
      subtotalMinor: data.subtotal_minor,
      deliveryFeeMinor: data.delivery_fee_minor,
      totalMinor: data.total_minor,
      items: ((data.order_items ?? []) as ItemRow[]).map((item) => ({
        nameEn: item.product_name_en,
        nameAr: item.product_name_ar,
        quantity: item.quantity,
        unitPriceMinor: item.unit_price_minor,
        addOns: (item.add_ons ?? []).map((addOn) => ({ nameEn: addOn.name_en, nameAr: addOn.name_ar, priceMinor: addOn.price_minor })),
      })),
      timeline: buildTimeline((data.order_events ?? []) as EventRow[]),
    };
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/domain/lookup-order.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Run the full suite, then commit**

Run: `npm test`
Expected: 121 existing + 8 new = **129 passed**.

```bash
git add features/tracking/lookup-order.ts tests/domain/lookup-order.test.ts
git commit -m "feat: add fail-closed order lookup service and timeline helper"
```

---

### Task 2: Tracking page, i18n keys, and header link

**Files:**
- Modify: `features/i18n/dictionaries.ts` (new keys in all three locales)
- Create: `app/track/page.tsx`
- Modify: `components/layout/SiteHeader.tsx` (add "Track order" link)

**Interfaces:**
- Consumes: `lookupOrder` (Task 1); `getServerT()` from `@/features/i18n/server`; `formatMoney` from `@/features/money`; `getAdminSupabase` from `@/lib/supabase/admin`.
- Produces: the public `/track` page — GET form (`?number=&email=`) + results below (order card or generic not-found); a `trackOrder` nav link in the header.

- [ ] **Step 1: Add the new dictionary keys**

In `features/i18n/dictionaries.ts`, append these keys to **all three** locale objects (after the existing `unknownVariant` entry in each):

- `trackOrder: 'Track order'` / `'تتبع الطلب'` / `'Suivre ma commande'`
- `trackTitle: 'Track your order'` / `'تتبع طلبك'` / `'Suivez votre commande'`
- `trackLede: 'Enter your order number and the email you used at checkout to see its status.'` / `'أدخل رقم طلبك والبريد الإلكتروني الذي استخدمته عند الدفع لمعرفة حالته.'` / `'Saisissez votre numéro de commande et l’e-mail utilisé lors du paiement pour voir son statut.'`
- `orderNumber: 'Order number'` / `'رقم الطلب'` / `'Numéro de commande'`
- `trackLookupFailed: 'We couldn’t find an order with those details.'` / `'لم نتمكن من العثور على طلب بهذه التفاصيل.'` / `'Nous n’avons pas trouvé de commande correspondant à ces détails.'`
- `checkConfirmationEmail: 'Check your confirmation email for the order number.'` / `'تحقق من بريد التأكيد لمعرفة رقم الطلب.'` / `'Vérifiez votre e-mail de confirmation pour le numéro de commande.'`
- `fulfillment: 'Fulfillment'` / `'التنفيذ'` / `'Exécution'`
- `deliveryDetails: 'Delivery details'` / `'تفاصيل التوصيل'` / `'Détails de la livraison'`
- `recipient: 'Recipient'` / `'المستلم'` / `'Destinataire'`
- `statusPending: 'Pending'` / `'قيد الانتظار'` / `'En attente'`
- `statusPaymentStarted: 'Payment started'` / `'بدأ الدفع'` / `'Paiement commencé'`
- `statusPaid: 'Paid'` / `'مدفوع'` / `'Payé'`
- `statusPaymentFailed: 'Payment failed'` / `'فشل الدفع'` / `'Paiement échoué'`
- `statusRefunded: 'Refunded'` / `'مسترد'` / `'Remboursé'`

- [ ] **Step 2: Create the tracking page**

`app/track/page.tsx`:

```tsx
import Link from 'next/link';
import { getServerT } from '@/features/i18n/server';
import { pickLocalized } from '@/features/i18n/pick';
import { formatMoney } from '@/features/money';
import { lookupOrder } from '@/features/tracking/lookup-order';
import { getAdminSupabase } from '@/lib/supabase/admin';

const FULFILLMENT_KEYS: Record<string, string> = {
  confirmed: 'orderConfirmed', preparing: 'preparing', ready_for_delivery: 'statusReadyForDelivery',
  out_for_delivery: 'outForDelivery', delivered: 'delivered', cancelled: 'statusCancelled',
};

const PAYMENT_KEYS: Record<string, string> = {
  pending: 'statusPending', payment_started: 'statusPaymentStarted', paid: 'statusPaid',
  payment_failed: 'statusPaymentFailed', cancelled: 'statusCancelled', refunded: 'statusRefunded',
};

export default async function TrackPage({ searchParams }: { searchParams: Promise<{ number?: string; email?: string }> }) {
  const { locale, t } = await getServerT();
  const params = await searchParams;
  const number = params.number?.trim();
  const email = params.email?.trim();
  const searched = Boolean(number && email);
  const order = searched ? await lookupOrder(getAdminSupabase(), { number: number as string, email: email as string }) : null;
  return <main className="content-frame">
    <p className="eyebrow">{t('trackOrder')}</p>
    <h1>{t('trackTitle')}</h1>
    <p>{t('trackLede')}</p>
    <form className="checkout-form" action="/track" method="get">
      <div className="form-grid">
        <label className="field"><span>{t('orderNumber')}</span><input type="text" name="number" defaultValue={number ?? ''} required /></label>
        <label className="field"><span>{t('email')}</span><input type="email" name="email" defaultValue={email ?? ''} required /></label>
      </div>
      <button className="button" type="submit">{t('trackOrder')}</button>
    </form>
    {searched && !order ? <div className="status-message" role="alert"><strong>{t('trackLookupFailed')}</strong><span>{t('checkConfirmationEmail')}</span></div> : null}
    {searched && order ? <section className="form-section">
      <p className="eyebrow">{t('orderEyebrow', { number: order.number })}</p>
      <div className="form-grid">
        <article className="status-message"><strong>{t('payment')}</strong><span>{t(PAYMENT_KEYS[order.paymentStatus] ?? 'statusPending')}</span></article>
        <article className="status-message"><strong>{t('fulfillment')}</strong><span>{t(FULFILLMENT_KEYS[order.fulfillmentStatus] ?? 'statusPending')}</span></article>
        <article className="status-message"><strong>{t('recipient')}</strong><span>{order.recipientName}</span></article>
        <article className="status-message"><strong>{t('deliveryDetails')}</strong><span>{order.deliveryCityCode} · {order.deliveryDate} · {order.deliveryWindow}</span></article>
      </div>
      <h2>{t('items')}</h2>
      <div className="admin-table">{order.items.map((item, index) => <article className="status-message" key={index}><strong>{pickLocalized(locale, { en: item.nameEn, ar: item.nameAr })}</strong><span>{t('quantity')} {item.quantity} · {formatMoney(item.unitPriceMinor, locale)}</span>{item.addOns.map((addOn) => <span key={addOn.nameEn}>+ {pickLocalized(locale, { en: addOn.nameEn, ar: addOn.nameAr })} · {formatMoney(addOn.priceMinor, locale)}</span>)}</article>)}</div>
      <div className="cart-summary"><div><span>{t('subtotal')}</span><span>{formatMoney(order.subtotalMinor, locale)}</span></div><div><span>{t('delivery')}</span><span>{formatMoney(order.deliveryFeeMinor, locale)}</span></div><div className="summary-total"><span>{t('total')}</span><span>{formatMoney(order.totalMinor, locale)}</span></div></div>
      <h2>{t('timeline')}</h2>
      <div className="admin-table">{order.timeline.map((entry, index) => <article className="status-message" key={index}><strong>{t(FULFILLMENT_KEYS[entry.status] ?? entry.status)}</strong><span>{new Date(entry.at).toLocaleString(locale === 'ar' ? 'ar-EG' : locale === 'fr' ? 'fr-FR' : 'en-EG')}</span></article>)}</div>
    </section> : null}
    <p><Link href="/shop">{t('keepBrowsing')}</Link></p>
  </main>;
}
```

- [ ] **Step 3: Add the header link**

In `components/layout/SiteHeader.tsx`, add a track link in the nav, before the `cart-link`:

```tsx
<Link href="/track">{t('trackOrder')}</Link>
```

- [ ] **Step 4: Verify typecheck, build, and dictionary test**

Run: `npm run lint && npm run build && npm test -- tests/domain/i18n-dictionary.test.ts`
Expected: all pass; `/track` appears in the build output; the dictionary-completeness test stays green with the new keys.

- [ ] **Step 5: Commit**

```bash
git add features/i18n/dictionaries.ts app/track/page.tsx components/layout/SiteHeader.tsx
git commit -m "feat: add customer order tracking page with trilingual copy"
```

---

### Task 3: Final verification

- [ ] **Step 1: Run the full gate**

Run: `npm test && npm run lint && npm run build && git diff --check`
Expected: all tests pass (121 existing + 8 new = **129**), tsc clean, build succeeds, no whitespace errors.

- [ ] **Step 2: Secret scan**

Run: `npm test -- tests/security/no-secrets.test.ts`
Expected: PASS — the repository secret scan covers all `ts/tsx/js/mjs/json/md/env/sql/css` files.

- [ ] **Step 3: Commit any stragglers**

```bash
git status --short
git add -A
git commit -m "chore: final order tracking verification" || echo "nothing to commit"
```
