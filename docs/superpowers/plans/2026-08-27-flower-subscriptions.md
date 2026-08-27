# Flower Subscriptions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add prepaid flower subscriptions — customers buy a bundle of N deliveries, deliveries materialize as normal orders on a schedule, and subscribers manage skip/pause/reschedule/cancel from their account.

**Architecture:** A new `features/subscriptions/` module contains one pure date-math module (single source of truth for cadence/skip/reschedule), a set of `security definer` Supabase RPCs (leveraging `alter default privileges ... grant execute ... to service_role` already set in `028_hardened_privileges.sql`), cron-driven order materialization, and account/admin/API surfaces. Bundle purchase uses the existing Paymob redirect path; the webhook is extended to activate the subscription. All reads/writes run through the service_role client (`getAdminSupabase()`), consistent with the rest of the app; RLS stays off for the new tables (inaccessible by default per `028`).

**Tech Stack:** Next.js App Router (OpenNext/Cloudflare), Supabase Postgres + security-definer RPCs, Paymob (redirect checkout) + demo-card fallback, Resend/Gmail email, vitest, existing shadcn/ui + i18n (en/ar/fr) patterns.

**Spec:** `docs/superpowers/specs/2026-08-27-flower-subscriptions-design.md`

## Global Constraints

- **Date representation:** all dates are `'YYYY-MM-DD'` strings (`DateRef`) computed in UTC at 00:00. Month-end clamp: monthly recurrence anchors on the original day-of-month, each occurrence clamped independently to that month's last day (Jan 31 → Feb 28 → Mar 31).
- **Single date source of truth:** all cadence/reschedule/skip/date-spacing MUST be computed by the pure functions in `features/subscriptions/schedule.ts`; RPCs receive pre-computed date arrays as `jsonb` and never compute date math themselves.
- **Money:** integer minor units. Bundle purchase order carries the full price; each materialized delivery order has all totals `0`, `payment_status = 'paid'`, `fulfillment_status = 'confirmed'`, `delivery_fee_minor = 0`, and `subscription_id`/`subscription_delivery_id` set. Subscription-source `total_minor = 0` orders are automatically excluded from admin revenue sums.
- **Security:** every new RPC is `language plpgsql security definer set search_path = public`, and ends with an explicit `grant execute on function ... to service_role;`. New tables get NO grants and NO RLS (service_role bypasses RLS).
- **Auth:** account-scoped reads and all writes use `getAdminSupabase()` (service_role) and scope by `customer.id` in the query — do NOT rely on RLS. Admin surfaces use `getCurrentAdmin()`. Emails are best-effort and never throw.
- **i18n:** every new user-facing string has a key in all of `features/i18n/locales/{en,ar,fr}.json`; keys use a `subscription*` prefix. en.json must match before a task is considered "done".
- **Testing:** pure logic → `tests/domain/*.test.ts`; migrations → SQL-content assertions; API routes → `tests/routes/*.test.ts`; components → `tests/components/*.test.tsx`. Run: `npx vitest run`.

---

## File Structure

New module `features/subscriptions/`:
- `schedule.ts` — **pure** date math (`parseDateRef`, `toDateRef`, `addInterval`, `datesFrom`). No side-effect imports.
- `types.ts` — shared TS types.
- `validation.ts` — `validateSubscriptionCheckout`.
- `repository.ts` — read queries (`getActivePlans`, `getPlanBySlug`, `listCustomerSubscriptions`, `getSubscriptionDetail`, `listAdminSubscriptions`, `getAdminTimeline`).
- `service.ts` — `createSubscription`, `activateSubscriptionIfPaid`, `cancelSubscriptionWithCredit`.
- `control.ts` — customer-facing controls (`listCustomerSubscriptions`, `getSubscriptionDetail`, `pauseSubscription`, `resumeSubscription`, `rescheduleDeliveries`, `skipDelivery`).
- `subscriptions-cron.ts` — `runSubscriptionsCron`.
- `email.ts` — `renderSubscriptionEmail`, `sendSubscriptionEmail`.
- `admin-actions.ts` — admin operators.
- UI (client): `SubscriptionsPanel.tsx`, `SubscriptionDetail.tsx`, `SubscriptionActions.tsx`, `AdminSubscribersTable.tsx`, `AdminTimeline.tsx`, `AdminPlanForm.tsx`.

Routes/pages:
- `app/api/subscriptions/route.ts` (POST)
- `app/api/account/subscriptions/route.ts` + `[id]`, `[id]/pause`, `[id]/resume`, `[id]/cancel`, `[id]/deliveries/[deliveryId]/reschedule`, `[id]/deliveries/[deliveryId]/skip`
- `app/api/admin/subscriptions/route.ts`, `app/api/admin/subscriptions/[id]/cancel/route.ts`, `app/api/admin/subscriptions/plans/route.ts`, `app/api/admin/subscriptions/plans/[id]/route.ts`
- `app/api/cron/subscriptions/route.ts`
- `app/[locale]/[city]/subscriptions/page.tsx`, `app/[locale]/[city]/subscriptions/[slug]/checkout/page.tsx`
- `app/[locale]/[city]/account/(dashboard)/subscriptions/page.tsx`, `.../subscriptions/[id]/page.tsx`
- `app/admin/subscriptions/page.tsx`, `app/admin/subscriptions/plans/page.tsx`, `app/admin/subscriptions/plans/new/page.tsx`, `app/admin/subscriptions/plans/[id]/page.tsx`

Modified:
- `supabase/migrations/033_subscriptions.sql` (create)
- `app/api/webhooks/paymob/route.ts` (activation hook)
- `components/account/AccountShell.tsx` (nav item)
- `components/admin/AdminShell.tsx` (nav item), `components/admin/AppSidebar.tsx` (icon)
- `features/i18n/locales/{en,ar,fr}.json`
- `features/admin/dashboard-stats.ts` + admin dashboard page (two tiles)

RPCs (all in `033_subscriptions.sql`): `create_subscription_order`, `activate_subscription`, `pause_subscription`, `resume_subscription`, `reDateSubsequentDeliveries`, `cancel_subscription`, `materialize_subscription_delivery`.

---

## Task 1: Pure schedule date-math module

**Files:**
- Create: `features/subscriptions/schedule.ts`
- Test: `tests/domain/subscription-schedule.test.ts`

**Interfaces:**
- Consumes: nothing (pure).
- Produces: `export type Frequency = 'weekly' | 'biweekly' | 'monthly';`, `export type DateRef = string;`, `export function toDateRef(date: Date): DateRef`, `export function parseDateRef(ref: DateRef): Date`, `export function addInterval(base: DateRef, frequency: Frequency): DateRef`, `export function datesFrom(anchor: DateRef, frequency: Frequency, count: number): DateRef[]`.

- [ ] **Step 1: Write the failing test**

`tests/domain/subscription-schedule.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { addInterval, datesFrom, parseDateRef, toDateRef } from '@/features/subscriptions/schedule';

describe('schedule date math', () => {
  it('toDateRef and parseDateRef round-trip a UTC date', () => {
    const ref = toDateRef(new Date(Date.UTC(2026, 8, 12)));
    expect(ref).toBe('2026-09-12');
    expect(parseDateRef(ref).getTime()).toBe(Date.UTC(2026, 8, 12));
  });
  it('weekly adds 7 days', () => { expect(addInterval('2026-09-12', 'weekly')).toBe('2026-09-19'); });
  it('biweekly adds 14 days', () => { expect(addInterval('2026-09-12', 'biweekly')).toBe('2026-09-26'); });
  it('monthly anchors on day-of-month across shorter months', () => {
    expect(addInterval('2026-01-31', 'monthly')).toBe('2026-02-28');
    expect(addInterval('2026-02-28', 'monthly')).toBe('2026-03-31');
  });
  it('monthly on a normal day preserves the day', () => { expect(addInterval('2026-03-15', 'monthly')).toBe('2026-04-15'); });
  it('datesFrom builds a full cadence', () => {
    expect(datesFrom('2026-09-12', 'weekly', 3)).toEqual(['2026-09-12', '2026-09-19', '2026-09-26']);
  });
  it('datesFrom with count 1 returns just the anchor', () => { expect(datesFrom('2026-09-12', 'weekly', 1)).toEqual(['2026-09-12']); });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/domain/subscription-schedule.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

`features/subscriptions/schedule.ts`:

```ts
export type Frequency = 'weekly' | 'biweekly' | 'monthly';
export type DateRef = string; // 'YYYY-MM-DD'

export function toDateRef(date: Date): DateRef {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseDateRef(ref: DateRef): Date {
  const [y = 0, m = 1, d = 1] = ref.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function daysInMonth(year: number, month0: number): number {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}

export function addInterval(base: DateRef, frequency: Frequency): DateRef {
  const d = parseDateRef(base);
  if (frequency === 'weekly') return toDateRef(new Date(d.getTime() + 7 * 86_400_000));
  if (frequency === 'biweekly') return toDateRef(new Date(d.getTime() + 14 * 86_400_000));
  const anchorDay = d.getUTCDate();
  const targetYear = d.getUTCFullYear();
  const targetMonth0 = d.getUTCMonth() + 1;
  const day = Math.min(anchorDay, daysInMonth(targetYear, targetMonth0));
  return toDateRef(new Date(Date.UTC(targetYear, targetMonth0, day)));
}

export function datesFrom(anchor: DateRef, frequency: Frequency, count: number): DateRef[] {
  const result: DateRef[] = [];
  let current = anchor;
  for (let i = 0; i < count; i += 1) { result.push(current); current = addInterval(current, frequency); }
  return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/domain/subscription-schedule.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add features/subscriptions/schedule.ts tests/domain/subscription-schedule.test.ts
git commit -m "feat(subscriptions): add pure schedule date-math module"
```

---

## Task 2: Schema migration (tables + orders/gift-card columns)

**Files:**
- Create: `supabase/migrations/033_subscriptions.sql`
- Test: `tests/domain/subscription-migration.test.ts`

**Interfaces:**
- Produces: tables `subscription_plans`, `subscriptions`, `subscription_deliveries`, `subscription_events`; new columns `orders.subscription_id`, `orders.subscription_delivery_id`; new nullable column `gift_card_purchases.source`.

- [ ] **Step 1: Write the failing test**

`tests/domain/subscription-migration.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(join('supabase/migrations', '033_subscriptions.sql'), 'utf8');

describe('033_subscriptions migration', () => {
  it('creates the four subscription tables', () => {
    for (const table of ['subscription_plans', 'subscriptions', 'subscription_deliveries', 'subscription_events']) {
      expect(sql).toContain(`create table if not exists public.${table} (`);
    }
  });
  it('subscriptions stores frequency and bundle price', () => {
    expect(sql).toMatch(/frequency text not null check \(frequency in \('weekly', 'biweekly', 'monthly'\)\)/);
    expect(sql).toMatch(/bundle_size integer not null/);
    expect(sql).toMatch(/price_minor integer not null/);
  });
  it('subscriptions tracks status, recipient, first date and checkout order', () => {
    expect(sql).toContain(`check (status in ('pending_payment', 'active', 'paused', 'completed', 'cancelled'))`);
    expect(sql).toMatch(/checkout_order_id uuid references public.orders\(id\)/);
  });
  it('subscriptions snapshots product and variant for fulfilment', () => {
    expect(sql).toMatch(/product_id uuid references public.products\(id\)/);
    expect(sql).toMatch(/variant_id uuid references public.product_variants\(id\)/);
  });
  it('subscription_deliveries is position-ordered and guarded', () => {
    expect(sql).toContain(`unique(subscription_id, position)`);
    expect(sql).toContain(`check (status in ('scheduled', 'ordered', 'cancelled'))`);
  });
  it('orders gets subscription linking columns', () => {
    expect(sql).toContain(`alter table public.orders add column if not exists subscription_id uuid references public.subscriptions(id);`);
    expect(sql).toContain(`alter table public.orders add column if not exists subscription_delivery_id uuid references public.subscription_deliveries(id);`);
  });
  it('gift_card_purchases gets a nullable source column', () => {
    expect(sql).toContain(`alter table public.gift_card_purchases add column if not exists source text;`);
  });
  it('does not grant anon or authenticated access to the new tables', () => {
    expect(sql).not.toMatch(/grants? (select|insert).*\b(subscription_plans|subscriptions|subscription_deliveries|subscription_events)\b/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/domain/subscription-migration.test.ts`
Expected: FAIL — migration file not found.

- [ ] **Step 3: Write minimal implementation**

`supabase/migrations/033_subscriptions.sql`:

```sql
-- 033_subscriptions.sql
-- Prepaid flower subscriptions. Security matches 028_hardened_privileges.sql: the new
-- tables ship with NO grants and NO RLS (service_role bypasses RLS); the app touches
-- them only through the service_role client. Every function carries an explicit
-- service_role grant.

create table if not exists public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name_en text not null,
  name_ar text not null default '',
  name_fr text not null default '',
  description_en text not null default '',
  description_ar text not null default '',
  description_fr text not null default '',
  product_id uuid references public.products(id),
  frequencies text[] not null check (cardinality(frequencies) > 0),
  bundle_prices jsonb not null,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id),
  plan_id uuid not null references public.subscription_plans(id),
  product_id uuid not null references public.products(id),
  variant_id uuid not null references public.product_variants(id),
  status text not null default 'pending_payment' check (status in ('pending_payment', 'active', 'paused', 'completed', 'cancelled')),
  frequency text not null check (frequency in ('weekly', 'biweekly', 'monthly')),
  bundle_size integer not null check (bundle_size > 0),
  price_minor integer not null check (price_minor > 0),
  locale text not null check (locale in ('en', 'ar', 'fr')),
  recipient_name text not null,
  recipient_phone text not null,
  delivery_address text not null,
  delivery_city_code text not null references public.cities(code),
  delivery_window text not null,
  gift_message text not null default '',
  first_delivery_date date not null,
  checkout_order_id uuid references public.orders(id),
  renewal_nudge_sent_at timestamptz,
  renewal_promo_code text,
  cancelled_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.subscription_deliveries (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  position integer not null check (position > 0),
  scheduled_date date not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'ordered', 'cancelled')),
  order_id uuid references public.orders(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(subscription_id, position)
);

create table if not exists public.subscription_events (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  delivery_id uuid references public.subscription_deliveries(id),
  actor text not null check (actor in ('customer', 'admin', 'system')),
  actor_id uuid references public.profiles(id),
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.orders add column if not exists subscription_id uuid references public.subscriptions(id);
alter table public.orders add column if not exists subscription_delivery_id uuid references public.subscription_deliveries(id);
alter table public.gift_card_purchases add column if not exists source text;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/domain/subscription-migration.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/033_subscriptions.sql tests/domain/subscription-migration.test.ts
git commit -m "feat(subscriptions): add subscription schema migration"
```

---

## Task 3: Bundle-purchase + activation RPCs

**Files:**
- Modify: `supabase/migrations/033_subscriptions.sql` (append)
- Test: `tests/domain/subscription-order-rpc-migration.test.ts`

**Interfaces:**
- Consumes: Task 1 `datesFrom` (called from JS, not the RPC); Task 2 tables.
- Produces: `public.create_subscription_order(p_checkout jsonb, p_lines jsonb) returns jsonb`; `public.activate_subscription(p_subscription_id uuid, p_dates jsonb) returns jsonb`.

- [ ] **Step 1: Write the failing test**

`tests/domain/subscription-order-rpc-migration.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(join('supabase/migrations', '033_subscriptions.sql'), 'utf8');
function fn(name: string): string {
  const s = sql.indexOf(`create or replace function public.${name}`);
  if (s === -1) return '';
  const e = sql.indexOf('$$;', s);
  return e === -1 ? '' : sql.slice(s, e);
}

describe('033 subscription order RPCs', () => {
  it('declares create_subscription_order with security definer and locked search path', () => {
    expect(sql).toContain('create or replace function public.create_subscription_order(');
    const b = fn('create_subscription_order');
    expect(b).toMatch(/\bp_checkout jsonb\b/);
    expect(b).toMatch(/\bp_lines jsonb\b/);
    expect(b).toMatch(/returns jsonb/);
    expect(b).toContain('security definer');
    expect(b).toMatch(/set search_path = public\b/);
  });
  it('rejects empty lines and invalid amounts', () => {
    const b = fn('create_subscription_order');
    expect(b).toContain("raise exception 'EMPTY_CART'");
    expect(b).toContain("raise exception 'INVALID_AMOUNT'");
  });
  it('inserts the subscription row without reserving inventory', () => {
    const b = fn('create_subscription_order');
    expect(b).toContain('insert into public.subscriptions(');
    expect(b).not.toMatch(/reserve_order_inventory/);
  });
  it('reuses the paid gift-card path and promo increment', () => {
    const b = fn('create_subscription_order');
    expect(b).toMatch(/payment_status = 'paid'/);
    expect(b).toContain('public.increment_promo_usage(');
  });
  it('activate_subscription takes pre-computed dates and never does interval math', () => {
    expect(sql).toContain('create or replace function public.activate_subscription(');
    const b = fn('activate_subscription');
    expect(b).toMatch(/\bp_dates jsonb\b/);
    expect(b).not.toMatch(/interval/i);
    expect(b).toContain('security definer');
  });
  it('grants service_role execute on both functions', () => {
    expect(sql).toContain('grant execute on function public.create_subscription_order(jsonb, jsonb) to service_role;');
    expect(sql).toContain('grant execute on function public.activate_subscription(uuid, jsonb) to service_role;');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/domain/subscription-order-rpc-migration.test.ts` → FAIL.

- [ ] **Step 3: Write minimal implementation**

Append to `supabase/migrations/033_subscriptions.sql`:

```sql
-- Bundle purchase: INSERT the order (full price, no inventory reservation),
-- INSERT the subscription row, honour gift-card holds/promo, default to pending
-- unless a gift card or zero-total path marks it paid. The app owns price/validation;
-- the DB owns write integrity of the decided values.

create or replace function public.create_subscription_order(
  p_checkout jsonb,
  p_lines jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_subscription_id uuid;
  v_display_number text;
  v_public_token text;
  v_hold_id uuid;
  v_total_minor int := (p_checkout->>'totalMinor')::int;
  v_gift_card_amount int := coalesce((p_checkout->>'giftCardMinor')::int, 0);
  v_gift_card_code_hash text := nullif(p_checkout->>'giftCardCodeHash', '');
  v_gift_card_id text := nullif(p_checkout->>'giftCardId', '');
  v_gift_card_code_last4 text := nullif(p_checkout->>'giftCardCodeLast4', '');
  v_line jsonb;
begin
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'EMPTY_CART';
  end if;
  if v_total_minor < 0 or v_gift_card_amount < 0 then
    raise exception 'INVALID_AMOUNT';
  end if;

  v_display_number := 'RO-' || upper(to_hex(extract(epoch from clock_timestamp())::bigint)) || '-' || upper(substring(md5(random()::text) for 4));
  v_public_token := encode(extensions.gen_random_bytes(24), 'hex');

  insert into public.orders(
    display_number, public_token, customer_id,
    customer_email, customer_phone, recipient_name, recipient_phone,
    delivery_address, delivery_city_code, delivery_date, delivery_window, locale,
    subtotal_minor, delivery_fee_minor, total_minor, discount_minor, promo_code,
    gift_card_minor, gift_card_id, gift_card_code_last4
  ) values (
    v_display_number, v_public_token, nullif(p_checkout->>'customerId', '')::uuid,
    p_checkout->>'customerEmail', p_checkout->>'customerPhone', p_checkout->>'recipientName', p_checkout->>'recipientPhone',
    p_checkout->>'deliveryAddress', p_checkout->>'cityCode', (p_checkout->>'deliveryDate')::date, p_checkout->>'deliveryWindow',
    coalesce(p_checkout->>'locale', 'en'),
    (p_checkout->>'subtotalMinor')::int, 0, v_total_minor,
    coalesce((p_checkout->>'discountMinor')::int, 0), nullif(p_checkout->>'promoCode', ''),
    v_gift_card_amount, nullif(v_gift_card_id, '')::uuid, v_gift_card_code_last4
  ) returning id into v_order_id;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    insert into public.order_items(
      order_id, product_id, variant_id, product_slug,
      product_name_en, product_name_ar, product_name_fr,
      unit_price_minor, quantity, add_ons, gift_message
    ) values (
      v_order_id, null, null, v_line->>'productSlug',
      v_line->>'productName', coalesce(v_line->>'productNameAr', ''), coalesce(v_line->>'productNameFr', ''),
      (v_line->>'unitPrice')::int, (v_line->>'quantity')::int,
      coalesce(v_line->'addOns', '[]'::jsonb), coalesce(v_line->>'message', '')
    );
  end loop;

  insert into public.subscriptions(
    customer_id, plan_id, product_id, variant_id, status, frequency,
    bundle_size, price_minor, locale,
    recipient_name, recipient_phone, delivery_address, delivery_city_code,
    delivery_window, gift_message, first_delivery_date, checkout_order_id
  ) values (
    nullif(p_checkout->>'customerId', '')::uuid,
    nullif(p_checkout->>'planId', '')::uuid,
    nullif(p_checkout->>'productId', '')::uuid,
    nullif(p_checkout->>'variantId', '')::uuid,
    'pending_payment',
    p_checkout->>'frequency',
    (p_checkout->>'bundleSize')::int,
    v_total_minor,
    coalesce(p_checkout->>'locale', 'en'),
    p_checkout->>'recipientName', p_checkout->>'recipientPhone', p_checkout->>'deliveryAddress', p_checkout->>'cityCode',
    p_checkout->>'deliveryWindow', coalesce(p_checkout->>'giftMessage', ''), (p_checkout->>'deliveryDate')::date,
    v_order_id
  ) returning id into v_subscription_id;

  update public.orders set subscription_id = v_subscription_id where id = v_order_id;

  if v_gift_card_code_hash is not null and v_gift_card_amount > 0 then
    v_hold_id := public.reserve_gift_card(v_gift_card_code_hash, v_order_id, v_gift_card_amount);
    update public.orders set gift_card_hold_id = v_hold_id where id = v_order_id;
    if v_total_minor = 0 then
      perform public.redeem_gift_card_hold(v_hold_id, 'gift-card-zero:' || v_order_id::text);
      update public.orders set payment_status = 'paid' where id = v_order_id;
      insert into public.payments(order_id, provider, provider_reference, idempotency_key, amount_minor, currency, status)
      values (v_order_id, 'gift_card', null, 'gift-card-zero-payment:' || v_order_id::text, 0, 'EGP', 'paid');
    end if;
  end if;

  if nullif(p_checkout->>'promoCode', '') is not null then
    perform public.increment_promo_usage(p_checkout->>'promoCode');
  end if;

  return jsonb_build_object(
    'order', (select row_to_json(o) from public.orders o where id = v_order_id),
    'subscription_id', v_subscription_id,
    'gift_card_hold_id', v_hold_id
  );
end;
$$;
grant execute on function public.create_subscription_order(jsonb, jsonb) to service_role;

-- pending_payment -> active, generating one subscription_deliveries row per
-- pre-computed p_dates entry (JSON array of 'YYYY-MM-DD' strings from schedule.ts).
-- Idempotent via the existing-rows guard.

create or replace function public.activate_subscription(
  p_subscription_id uuid,
  p_dates jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub record;
  v_has_rows boolean;
  v_idx int;
  v_date text;
begin
  select * into v_sub from public.subscriptions where id = p_subscription_id;
  if v_sub.id is null then raise exception 'SUBSCRIPTION_NOT_FOUND'; end if;
  select exists(select 1 from public.subscription_deliveries where subscription_id = p_subscription_id and status <> 'cancelled') into v_has_rows;
  if v_has_rows then
    if v_sub.status = 'pending_payment' then
      update public.subscriptions set status = 'active', updated_at = now() where id = p_subscription_id;
      insert into public.subscription_events(subscription_id, actor, event_type, payload)
      values (p_subscription_id, 'system', 'activated', jsonb_build_object('to', 'active'));
    end if;
    return jsonb_build_object('status', 'already_activated');
  end if;
  if v_sub.status <> 'pending_payment' then raise exception 'SUBSCRIPTION_NOT_PENDING'; end if;
  update public.subscriptions set status = 'active', updated_at = now() where id = p_subscription_id;
  v_idx := 1;
  for v_date in select jsonb_array_elements_text(p_dates) loop
    insert into public.subscription_deliveries(subscription_id, position, scheduled_date, status)
    values (p_subscription_id, v_idx, v_date::date, 'scheduled');
    v_idx := v_idx + 1;
  end loop;
  insert into public.subscription_events(subscription_id, actor, event_type, payload)
  values (p_subscription_id, 'system', 'activated', jsonb_build_object('to', 'active', 'deliveries', jsonb_array_length(p_dates)));
  return jsonb_build_object('status', 'activated', 'deliveries', v_idx - 1);
end;
$$;
grant execute on function public.activate_subscription(uuid, jsonb) to service_role;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/domain/subscription-order-rpc-migration.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/033_subscriptions.sql tests/domain/subscription-order-rpc-migration.test.ts
git commit -m "feat(subscriptions): add bundle-purchase and activation RPCs"
```

---

## Task 4: Types, validation, service + `/api/subscriptions` route + webhook activation

**Files:**
- Create: `features/subscriptions/types.ts`, `features/subscriptions/validation.ts`, `features/subscriptions/repository.ts`, `features/subscriptions/service.ts`
- Create: `app/api/subscriptions/route.ts`
- Modify: `app/api/webhooks/paymob/route.ts`
- Test: `tests/domain/subscription-purchase.test.ts`, `tests/routes/subscription-purchase.test.ts`

**Interfaces:**
- Consumes: Task 1 `datesFrom`/`Frequency`; Task 3 RPCs; gift-card crypto `{ generateGiftCardCode, hashGiftCardCode, encryptGiftCardCode, maskGiftCardCode }` from `@/features/gift-cards/crypto`; `createPaymobIntention`; `getCurrentCustomer`; `getAdminSupabase`; `resolvePaymentMethodAvailability`; `RATE_LIMITS`/`enforceRateLimit`; `checkTurnstileToken`; `getClientIp`; `getPublicOrigin`; logger.
- Produces: `types.ts` (types below); `validateSubscriptionCheckout`; `getActivePlans`, `getPlanBySlug`; `createSubscription`, `activateSubscriptionIfPaid`.

- [ ] **Step 1: Write the failing tests**

`tests/domain/subscription-purchase.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { validateSubscriptionCheckout } from '@/features/subscriptions/validation';

const plan = {
  id: 'p1', slug: 'classic', nameEn: 'The Classic', nameAr: '', nameFr: '',
  descriptionEn: '', descriptionAr: '', descriptionFr: '',
  frequencies: ['weekly', 'biweekly'] as const,
  bundlePrices: [{ deliveries: 4, priceMinor: 120000 }, { deliveries: 8, priceMinor: 220000 }],
  productId: 'prod1', active: true, sortOrder: 0,
};
const base = { slug: 'classic', frequency: 'weekly', bundleSize: 4, recipientName: 'Mom', recipientPhone: '+201000000', deliveryAddress: '12 Nile St', cityCode: 'cairo', deliveryWindow: 'Morning', deliveryDate: '2026-09-15', locale: 'en', giftMessage: '', promoCode: '', giftCardMinor: 0 };

it('accepts a valid checkout', () => { expect(validateSubscriptionCheckout(plan, base, new Date('2026-09-13T00:00:00Z')).ok).toBe(true); });
it('rejects an inactive plan', () => { expect(validateSubscriptionCheckout({ ...plan, active: false }, base, new Date('2026-09-13T00:00:00Z')).ok).toBe(false); });
it('rejects an unoffered frequency', () => { expect(validateSubscriptionCheckout(plan, { ...base, frequency: 'monthly' }, new Date('2026-09-13T00:00:00Z')).ok).toBe(false); });
it('rejects an unoffered bundle size', () => { expect(validateSubscriptionCheckout(plan, { ...base, bundleSize: 12 }, new Date('2026-09-13T00:00:00Z')).ok).toBe(false); });
it('rejects a first delivery date inside the 1-day lead time', () => {
  // now = 2026-09-14; delivery must be >= 2026-09-15; 2026-09-14 is too soon
  expect(validateSubscriptionCheckout(plan, { ...base, deliveryDate: '2026-09-14' }, new Date('2026-09-14T00:00:00Z')).ok).toBe(false);
});
```

`tests/routes/subscription-purchase.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/subscriptions/route';
import * as auth from '@/features/auth/customer';

vi.mock('@/lib/turnstile', () => ({ checkTurnstileToken: vi.fn().mockResolvedValue('pass') }));
vi.mock('@/features/checkout/payment-mode', () => ({ resolvePaymentMethodAvailability: () => ({ allowed: true }) }));

describe('POST /api/subscriptions', () => {
  it('returns 401 when the customer is signed out', async () => {
    vi.spyOn(auth, 'getCurrentCustomer').mockResolvedValue(null);
    const res = await POST(new Request('http://localhost/api/subscriptions', { method: 'POST', body: '{}' }));
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/domain/subscription-purchase.test.ts tests/routes/subscription-purchase.test.ts` → FAIL (modules missing).

- [ ] **Step 3: Write minimal implementation**

`features/subscriptions/types.ts`:

```ts
export type Frequency = 'weekly' | 'biweekly' | 'monthly';
export type SubscriptionStatus = 'pending_payment' | 'active' | 'paused' | 'completed' | 'cancelled';
export type PlanPrices = Array<{ deliveries: number; priceMinor: number }>;
export type Plan = {
  id: string; slug: string; nameEn: string; nameAr: string; nameFr: string;
  descriptionEn: string; descriptionAr: string; descriptionFr: string;
  frequencies: Frequency[]; bundlePrices: PlanPrices; productId: string; active: boolean; sortOrder: number;
};
```

`features/subscriptions/validation.ts`:

```ts
import type { Frequency, Plan } from './types';

export function validateSubscriptionCheckout(
  plan: Plan,
  input: Record<string, unknown>,
  now = new Date(),
): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  if (!plan.active) return { ok: false, error: 'plan_unavailable' };
  const frequency = input.frequency as Frequency;
  if (!plan.frequencies.includes(frequency)) return { ok: false, error: 'invalid_frequency' };
  const bundleSize = Number(input.bundleSize);
  if (!plan.bundlePrices.some((p) => p.deliveries === bundleSize)) return { ok: false, error: 'invalid_bundle_size' };
  if (!input.recipientName || !input.recipientPhone || !input.deliveryAddress || !input.cityCode || !input.deliveryWindow || !input.deliveryDate) {
    return { ok: false, error: 'incomplete_destination' };
  }
  const date = new Date(`${input.deliveryDate}T00:00:00Z`);
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (date.getTime() < todayStart.getTime() + 86_400_000) return { ok: false, error: 'lead_time' };
  return { ok: true, value: { frequency, bundleSize, ...input, priceMinor: plan.bundlePrices.find((p) => p.deliveries === bundleSize)!.priceMinor } };
}
```

`features/subscriptions/repository.ts`:

```ts
import type { Plan } from './types';

type Client = { from: (table: string) => any };
function mapPlan(row: any): Plan {
  return {
    id: String(row.id), slug: String(row.slug),
    nameEn: String(row.name_en ?? ''), nameAr: String(row.name_ar ?? ''), nameFr: String(row.name_fr ?? ''),
    descriptionEn: String(row.description_en ?? ''), descriptionAr: String(row.description_ar ?? ''), descriptionFr: String(row.description_fr ?? ''),
    frequencies: (row.frequencies ?? []) as Plan['frequencies'],
    bundlePrices: row.bundle_prices ?? [],
    productId: row.product_id ? String(row.product_id) : '',
    active: row.active !== false,
    sortOrder: Number(row.sort_order ?? 0),
  };
}
export async function getActivePlans(client: Client): Promise<Plan[]> {
  const { data, error } = await client.from('subscription_plans').select('*').eq('active', true).order('sort_order', { ascending: true });
  return error || !data ? [] : ((data as any[]) ?? []).map(mapPlan);
}
export async function getPlanBySlug(client: Client, slug: string): Promise<Plan | null> {
  const { data, error } = await client.from('subscription_plans').select('*').eq('slug', slug).maybeSingle();
  return error || !data ? null : mapPlan(data);
}
```

`features/subscriptions/service.ts`:

```ts
import { getOptionalServerEnv, getRequiredServerEnv } from '@/lib/server-env';
import { createPaymobIntention } from '@/features/payment/paymob-client';
import type { PaymentCustomer } from '@/features/payment/paymob-client';
import { datesFrom } from './schedule';
import type { Frequency } from './types';
import { getPlanBySlug } from './repository';
import { validateSubscriptionCheckout } from './validation';

type Client = { from: (table: string) => any; rpc?: (name: string, args: Record<string, unknown>) => any };
type IntentionInput = { amountMinor: number; orderReference: string; customer: PaymentCustomer; notificationUrl: string; redirectionUrl: string };
type IntentionCreator = (input: IntentionInput) => Promise<{ checkoutUrl: string }>;

export type CreateSubscriptionResult =
  | { ok: true; value: { orderId: string; subscriptionId: string; publicToken: string; displayNumber: string; paymentStatus: string; checkoutUrl: string | null } }
  | { ok: false; error: string };

async function resolveProductVariant(client: Client, productId: string) {
  const { data, error } = await client.from('product_variants')
    .select('id,slug,name_en,name_ar,name_fr,price_minor')
    .eq('product_id', productId).eq('active', true).order('price_minor', { ascending: true }).limit(1).maybeSingle();
  if (error || !data) throw new Error('PRODUCT_VARIANT_NOT_FOUND');
  return { variantId: String(data.id), slug: String(data.slug), nameEn: String(data.name_en), nameAr: String(data.name_ar), nameFr: String(data.name_fr), priceMinor: Number(data.price_minor) };
}

const defaultCreateIntention: IntentionCreator = (input) => createPaymobIntention({ ...input, integrationId: Number(getRequiredServerEnv('PAYMOB_INTEGRATION_ID')) });

export async function createSubscription(
  client: Client,
  input: { slug: string; frequency: Frequency; bundleSize: number; recipientName: string; recipientPhone: string; deliveryAddress: string; cityCode: string; deliveryWindow: string; deliveryDate: string; locale: 'en' | 'ar' | 'fr'; giftMessage: string; customerEmail: string; customerPhone: string; customerId: string; promoCode?: string; promoDiscountMinor?: number; giftCard?: { id: string; codeHash: string; codeLast4: string; amountAppliedMinor: number; remainingTotalMinor: number } },
  deps: { origin: string; now?: Date; createIntention?: IntentionCreator } = {},
): Promise<CreateSubscriptionResult> {
  const c = client as any;
  const plan = await getPlanBySlug(client, input.slug);
  if (!plan) return { ok: false, error: 'plan_unavailable' };
  const validation = validateSubscriptionCheckout(plan, input, deps.now ?? new Date());
  if (!validation.ok) return { ok: false, error: validation.error };
  const v = validation.value as any;
  if (v.giftCardMinor > 0 && !input.giftCard) return { ok: false, error: 'invalid_gift_card' };
  const subtotalMinor = v.priceMinor as number;
  const discountMinor = Math.min(Math.max(0, input.promoDiscountMinor ?? 0), subtotalMinor);
  const totalMinor = Math.max(0, subtotalMinor - discountMinor - (v.giftCardMinor ?? 0));
  const variant = await resolveProductVariant(client, plan.productId);
  const line = { productSlug: variant.slug, productName: variant.nameEn, productNameAr: variant.nameAr, productNameFr: variant.nameFr, unitPrice: subtotalMinor, quantity: 1, addOns: [], message: String(input.giftMessage || '') };
  const payload = {
    customerId: input.customerId, customerEmail: input.customerEmail, customerPhone: input.customerPhone,
    recipientName: String(input.recipientName), recipientPhone: String(input.recipientPhone), deliveryAddress: String(input.deliveryAddress),
    cityCode: input.cityCode, deliveryWindow: input.deliveryWindow, deliveryDate: input.deliveryDate,
    locale: input.locale, frequency: input.frequency, bundleSize: input.bundleSize,
    planId: plan.id, productId: plan.productId, variantId: variant.variantId, giftMessage: String(input.giftMessage),
    promoCode: input.promoCode || null, subtotalMinor, discountMinor, giftCardMinor: v.giftCardMinor ?? 0, totalMinor,
    giftCardId: input.giftCard?.id ?? null, giftCardCodeHash: input.giftCard?.codeHash ?? null, giftCardCodeLast4: input.giftCard?.codeLast4 ?? null,
  };
  const { data, error } = await c.rpc('create_subscription_order', { p_checkout: payload, p_lines: [line] });
  if (error) return { ok: false, error: 'unavailable' };
  const order = data?.order ?? {};
  const subscriptionId = String(data?.subscription_id);
  const paymobConfigured = Boolean(getOptionalServerEnv('PAYMOB_API_KEY') && getOptionalServerEnv('PAYMOB_PUBLIC_KEY') && getOptionalServerEnv('PAYMOB_INTEGRATION_ID') && getOptionalServerEnv('PAYMOB_HMAC_SECRET'));
  if (order.total_minor === 0 || !paymobConfigured) {
    await activateSubscriptionIfPaid(client, subscriptionId, { parentClient: client });
    return { ok: true, value: { orderId: String(order.id), subscriptionId, publicToken: String(order.public_token), displayNumber: String(order.display_number), paymentStatus: 'paid', checkoutUrl: null } };
  }
  try {
    const intention = deps.createIntention ?? defaultCreateIntention;
    const payment = await intention({
      amountMinor: Number(order.total_minor), orderReference: String(order.display_number),
      customer: { name: String(input.recipientName), email: input.customerEmail, phone: String(input.recipientPhone) },
      notificationUrl: `${deps.origin.replace(/\/$/, '')}/api/webhooks/paymob`,
      redirectionUrl: `${deps.origin.replace(/\/$/, '')}/${input.locale}/cairo/orders/${order.id}?token=${encodeURIComponent(String(order.public_token))}`,
    });
    return { ok: true, value: { orderId: String(order.id), subscriptionId, publicToken: String(order.public_token), displayNumber: String(order.display_number), paymentStatus: 'payment_started', checkoutUrl: payment.checkoutUrl } };
  } catch {
    return { ok: false, error: 'unavailable' };
  }
}

export async function activateSubscriptionIfPaid(client: Client, subscriptionId: string, deps: { parentClient?: Client } = {}): Promise<'activated' | 'already_active' | 'not_found' | 'noop'> {
  const c = (deps.parentClient ?? client) as any;
  const { data: sub } = await c.from('subscriptions').select('id,status,frequency,first_delivery_date,bundle_size').eq('id', subscriptionId).maybeSingle();
  if (!sub) return 'not_found';
  if (sub.status === 'active') return 'already_active';
  if (sub.status !== 'pending_payment') return 'noop';
  const dates = datesFrom(String(sub.first_delivery_date), sub.frequency as Frequency, Number(sub.bundle_size));
  const { error } = await c.rpc('activate_subscription', { p_subscription_id: subscriptionId, p_dates: dates });
  return error ? 'noop' : 'activated';
}
```

`app/api/subscriptions/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { getOptionalServerEnv } from '@/lib/server-env';
import { getPublicOrigin } from '@/lib/origin';
import { getCurrentCustomer } from '@/features/auth/customer';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { resolvePaymentMethodAvailability } from '@/features/checkout/payment-mode';
import { RATE_LIMITS, enforceRateLimit } from '@/lib/rate-limit-guard';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { checkTurnstileToken } from '@/lib/turnstile';
import { logger } from '@/lib/logger';
import { createSubscription } from '@/features/subscriptions/service';

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, RATE_LIMITS.orders);
  if (limited) return limited;
  const customer = await getCurrentCustomer();
  if (!customer) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Malformed request' }, { status: 400 });
  const turnstile = await checkTurnstileToken(body.turnstileToken, getOptionalServerEnv('TURNSTILE_SECRET_KEY'), getClientIp(request));
  if (turnstile !== 'pass') return NextResponse.json({ error: turnstile === 'missing' ? 'Human verification required' : 'Human verification failed' }, { status: 400 });
  const paymentMethod = (body.paymentMethod as string) ?? 'paymob';
  const paymentPath = resolvePaymentMethodAvailability(paymentMethod as 'paymob' | 'pay-on-delivery' | 'demo-card');
  if (!paymentPath.allowed || paymentMethod === 'pay-on-delivery') return NextResponse.json({ error: 'Payment method unavailable' }, { status: 409 });
  const result = await createSubscription(getAdminSupabase(), {
    slug: String(body.planSlug ?? ''), frequency: body.frequency, bundleSize: Number(body.bundleSize),
    recipientName: String(body.recipientName ?? ''), recipientPhone: String(body.recipientPhone ?? ''),
    deliveryAddress: String(body.deliveryAddress ?? ''), cityCode: String(body.cityCode ?? ''),
    deliveryWindow: String(body.deliveryWindow ?? ''), deliveryDate: String(body.deliveryDate ?? ''),
    locale: (body.locale === 'ar' || body.locale === 'fr' ? body.locale : 'en') as 'en' | 'ar' | 'fr',
    giftMessage: String(body.giftMessage ?? ''), customerEmail: customer.email, customerPhone: customer.phone ?? '', customerId: customer.id,
    promoCode: body.promoCode ? String(body.promoCode) : undefined, promoDiscountMinor: Number(body.promoDiscountMinor ?? 0),
    giftCard: body.giftCardId ? { id: String(body.giftCardId), codeHash: String(body.giftCardCodeHash ?? ''), codeLast4: String(body.giftCardGLast4 ?? ''), amountAppliedMinor: Number(body.giftCardAmountAppliedMinor ?? 0), remainingTotalMinor: Number(body.giftCardRemainingTotalMinor ?? 0) } : undefined,
  }, { origin: getPublicOrigin(request) });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.error === 'plan_unavailable' || result.error === 'invalid_frequency' || result.error === 'invalid_bundle_size' || result.error === 'incomplete_destination' || result.error === 'lead_time' ? 400 : 409 });
  return NextResponse.json(result.value);
}
```

Modify `app/api/webhooks/paymob/route.ts`:
- Add import: `import { activateSubscriptionIfPaid } from '@/features/subscriptions/service';`
- Extend the order select (line ~85) to include `subscription_id`.
- Inside `if (success) {...}` after the `deliverOrderNotification` call, append:

```ts
if (order.subscription_id) {
  const activation = await activateSubscriptionIfPaid(supabase, String(order.subscription_id), { parentClient: supabase });
  if (activation === 'noop') logger.warn('payment.webhook.subscription_activation_failed', { orderReference, subscriptionId: String(order.subscription_id) });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/domain/subscription-purchase.test.ts tests/routes/subscription-purchase.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add features/subscriptions/types.ts features/subscriptions/validation.ts features/subscriptions/repository.ts features/subscriptions/service.ts app/api/subscriptions/route.ts app/api/webhooks/paymob/route.ts tests/domain/subscription-purchase.test.ts tests/routes/subscription-purchase.test.ts
git commit -m "feat(subscriptions): add bundle purchase route, service and webhook activation"
```

---

## Task 5: Control RPCs + `control.ts` + account API routes

**Files:**
- Modify: `supabase/migrations/033_subscriptions.sql` (append control RPCs)
- Create: `features/subscriptions/control.ts`
- Create: `tests/domain/subscription-control-rpc-migration.test.ts`, `tests/domain/subscription-control.test.ts`, `tests/routes/subscription-account.test.ts` tiny
- Create: `app/api/account/subscriptions/route.ts`, `[id]/route.ts`, `[id]/pause/route.ts`, `[id]/resume/route.ts`, `[id]/cancel/route.ts`, `[id]/deliveries/[deliveryId]/reschedule/route.ts`, `[id]/deliveries/[deliveryId]/skip/route.ts`

**Interfaces:**
- Consumes: Task 1 `datesFrom`; Task 4 `Subscription`/`Plan`.
- Produces: RPCs `pause_subscription(uuid)`, `resume_subscription(uuid, jsonb)`, `reDateSubsequentDeliveries(uuid, integer, jsonb)`, `cancel_subscription(uuid)`; `control.ts` functions.

- [ ] **Step 1: Write the failing tests**

`tests/domain/subscription-control-rpc-migration.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
const sql = readFileSync(join('supabase/migrations', '033_subscriptions.sql'), 'utf8');
function fn(name: string): string {
  const s = sql.indexOf(`create or replace function public.${name}`);
  if (s === -1) return '';
  const e = sql.indexOf('$$;', s);
  return e === -1 ? '' : sql.slice(s, e);
}
describe('033 control RPCs', () => {
  it('declares the control functions security definer + service_role grants', () => {
    for (const name of ['pause_subscription', 'resume_subscription', 'reDateSubsequentDeliveries', 'cancel_subscription']) {
      expect(sql).toContain(`create or replace function public.${name}(`);
      expect(fn(name)).toContain('security definer');
    }
    expect(sql).toContain('grant execute on function public.pause_subscription(uuid) to service_role;');
    expect(sql).toContain('grant execute on function public.resume_subscription(uuid, jsonb) to service_role;');
    expect(sql).toContain('grant execute on function public.reDateSubsequentDeliveries(uuid, integer, jsonb) to service_role;');
    expect(sql).toContain('grant execute on function public.cancel_subscription(uuid) to service_role;');
  });
  it('reDate uses pre-computed dates, never interval math', () => {
    const b = fn('reDateSubsequentDeliveries');
    expect(b).toContain('p_dates jsonb');
    expect(b).not.toMatch(/interval/i);
  });
  it('cancel marks scheduled deliveries cancelled and returns a count', () => {
    const b = fn('cancel_subscription');
    expect(b).toMatch(/status = 'cancelled'/);
    expect(b).toContain('unmaterialized_count');
    expect(b).toMatch(/returns jsonb/);
  });
});
```

`tests/domain/subscription-control.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { datesFrom } from '@/features/subscriptions/schedule';
describe('repositioning rules', () => {
  it('skip re-anchors chosen + later at +1 interval', () => {
    const original = datesFrom('2026-09-12', 'weekly', 4);
    const skipped = datesFrom(original[1]!, 'weekly', 1)[0];
    expect(datesFrom(skipped, 'weekly', original.length - 1)).toEqual(['2026-09-26', '2026-10-03', '2026-10-10']);
  });
  it('resume re-spaces all remaining from the resume date', () => {
    expect(datesFrom('2026-10-01', 'monthly', 3)).toEqual(['2026-10-01', '2026-11-01', '2026-12-01']);
  });
});
```

`tests/routes/subscription-account.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/account/subscriptions/route';
import * as auth from '@/features/auth/customer';
describe('GET /api/account/subscriptions', () => {
  it('returns 401 when signed out', async () => {
    vi.spyOn(auth, 'getCurrentCustomer').mockResolvedValue(null);
    const res = await GET(new Request('http://localhost/api/account/subscriptions'));
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails** → `npx vitest run tests/domain/subscription-control-rpc-migration.test.ts tests/domain/subscription-control.test.ts tests/routes/subscription-account.test.ts` → FAIL.

- [ ] **Step 3: Write minimal implementation**

Append to `supabase/migrations/033_subscriptions.sql`:

```sql
-- pause/resume/reschedule/skip/cancel. p_dates arrays are pre-computed by schedule.ts.

create or replace function public.pause_subscription(p_subscription_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update public.subscriptions set status = 'paused', updated_at = now()
   where id = p_subscription_id and status = 'active';
  if not found then return false; end if;
  insert into public.subscription_events(subscription_id, actor, event_type, payload)
  values (p_subscription_id, 'customer', 'paused', '{}'::jsonb);
  return true;
end; $$;
grant execute on function public.pause_subscription(uuid) to service_role;

create or replace function public.resume_subscription(p_subscription_id uuid, p_dates jsonb)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_pos int; v_date text;
begin
  v_pos := 1;
  for v_date in select jsonb_array_elements_text(p_dates) loop
    update public.subscription_deliveries set scheduled_date = v_date::date, updated_at = now()
     where subscription_id = p_subscription_id and status = 'scheduled' and position = v_pos;
    v_pos := v_pos + 1;
  end loop;
  update public.subscriptions set status = 'active', updated_at = now()
   where id = p_subscription_id and status = 'paused';
  if not found then return false; end if;
  insert into public.subscription_events(subscription_id, actor, event_type, payload)
  values (p_subscription_id, 'customer', 'resumed', jsonb_build_object('deliveries', v_pos - 1));
  return true;
end; $$;
grant execute on function public.resume_subscription(uuid, jsonb) to service_role;

create or replace function public.reDateSubsequentDeliveries(
  p_subscription_id uuid, p_from_position integer, p_dates jsonb
)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_sub record; v_offset int; v_date text;
begin
  select status into v_sub from public.subscriptions where id = p_subscription_id;
  if v_sub.status is null then return false; end if;
  if v_sub.status not in ('active', 'paused') then return false; end if;
  v_offset := p_from_position;
  for v_date in select jsonb_array_elements_text(p_dates) loop
    update public.subscription_deliveries set scheduled_date = v_date::date, updated_at = now()
     where subscription_id = p_subscription_id and status = 'scheduled' and position = v_offset;
    v_offset := v_offset + 1;
  end loop;
  return true;
end; $$;
grant execute on function public.reDateSubsequentDeliveries(uuid, integer, jsonb) to service_role;

create or replace function public.cancel_subscription(p_subscription_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_unmaterialized int;
begin
  update public.subscription_deliveries set status = 'cancelled', updated_at = now()
   where subscription_id = p_subscription_id and status = 'scheduled';
  get diagnostics v_unmaterialized = row_count;
  update public.subscriptions set status = 'cancelled', cancelled_at = now(), updated_at = now()
   where id = p_subscription_id and status in ('active', 'paused');
  if not found then return jsonb_build_object('cancelled', false, 'unmaterialized_count', 0); end if;
  insert into public.subscription_events(subscription_id, actor, event_type, payload)
  values (p_subscription_id, 'customer', 'cancelled', jsonb_build_object('unmaterialized_count', v_unmaterialized));
  return jsonb_build_object('cancelled', true, 'unmaterialized_count', v_unmaterialized);
end; $$;
grant execute on function public.cancel_subscription(uuid) to service_role;
```

`features/subscriptions/control.ts`:

```ts
import type { Frequency } from './types';
import { datesFrom } from './schedule';

type Client = { from: (table: string) => any; rpc?: (name: string, args: Record<string, unknown>) => any };

export type DeliveryRow = { id: string; position: number; scheduledDate: string; status: 'scheduled' | 'ordered' | 'cancelled'; orderId: string | null };

export async function listCustomerSubscriptions(client: Client, customerId: string) {
  const { data } = await client.from('subscriptions')
    .select('id,status,frequency,bundle_size,price_minor,first_delivery_date,subscription_plans(name_en)')
    .eq('customer_id', customerId).order('created_at', { ascending: false });
  const rows = (data ?? []) as any[];
  const counts = await Promise.all(rows.map(async (row) => {
    const { data: d } = await client.from('subscription_deliveries').select('status').eq('subscription_id', row.id);
    return ((d ?? []) as any[]).filter((x) => x.status === 'ordered').length;
  }));
  return rows.map((row, i) => ({ id: String(row.id), planNameEn: String(row.subscription_plans?.name_en ?? ''), status: row.status, frequency: row.frequency, bundleSize: Number(row.bundle_size), priceMinor: Number(row.price_minor), firstDeliveryDate: String(row.first_delivery_date), orderedCount: counts[i]! }));
}

export async function getSubscriptionDetail(client: Client, subscriptionId: string) {
  const { data } = await client.from('subscriptions')
    .select('*,subscription_plans(name_en,name_ar,name_fr),products(id,name_en,name_ar,name_fr)')
    .eq('id', subscriptionId).maybeSingle();
  if (!data) return null;
  const { data: deliveries } = await client.from('subscription_deliveries').select('id,position,scheduled_date,status,order_id').eq('subscription_id', subscriptionId).order('position', { ascending: true });
  return {
    id: String(data.id), customerId: String(data.customer_id), planId: String(data.plan_id),
    productId: String(data.product_id), variantId: String(data.variant_id), status: data.status,
    frequency: data.frequency, bundleSize: Number(data.bundle_size), priceMinor: Number(data.price_minor),
    locale: data.locale, recipientName: String(data.recipient_name), recipientPhone: String(data.recipient_phone),
    deliveryAddress: String(data.delivery_address), deliveryCityCode: String(data.delivery_city_code),
    deliveryWindow: String(data.delivery_window), giftMessage: String(data.gift_message ?? ''),
    firstDeliveryDate: String(data.first_delivery_date), checkoutOrderId: data.checkout_order_id ? String(data.checkout_order_id) : null,
    renewalNudgeSentAt: data.renewal_nudge_sent_at ?? null, renewalPromoCode: data.renewal_promo_code ?? null,
    cancelledAt: data.cancelled_at ?? null, completedAt: data.completed_at ?? null, createdAt: String(data.created_at),
    planNameEn: String(data.subscription_plans?.name_en ?? ''), planNameAr: String(data.subscription_plans?.name_ar ?? ''), planNameFr: String(data.subscription_plans?.name_fr ?? ''),
    deliveries: (deliveries ?? []).map((d: any) => ({ id: String(d.id), position: Number(d.position), scheduledDate: String(d.scheduled_date), status: d.status, orderId: d.order_id ? String(d.order_id) : null })),
  };
}

export async function pauseSubscription(client: Client, subscriptionId: string, customerId: string): Promise<boolean> {
  const { data } = await client.from('subscriptions').select('id').eq('id', subscriptionId).eq('customer_id', customerId).maybeSingle();
  if (!data) return false;
  const { data: ok, error } = await client.rpc?.('pause_subscription', { p_subscription_id: subscriptionId }) ?? { data: false, error: true };
  return !error && ok === true;
}

export async function resumeSubscription(client: Client, subscriptionId: string, customerId: string, nextDeliveryDate: string): Promise<boolean> {
  const { data: owned } = await client.from('subscriptions').select('id,frequency').eq('id', subscriptionId).eq('customer_id', customerId).maybeSingle();
  if (!owned) return false;
  const { data: remaining } = await client.from('subscription_deliveries').select('id').eq('subscription_id', subscriptionId).eq('status', 'scheduled');
  const dates = datesFrom(nextDeliveryDate, owned.frequency as Frequency, Math.max(((remaining ?? []) as any[]).length, 1));
  const { data: ok, error } = await client.rpc?.('resume_subscription', { p_subscription_id: subscriptionId, p_dates: dates }) ?? { data: false, error: true };
  return !error && ok === true;
}

export async function rescheduleDeliveries(client: Client, subscriptionId: string, customerId: string, deliveryId: string, newDate: string, isSkip: boolean): Promise<boolean> {
  const { data: owned } = await client.from('subscriptions').select('id,frequency').eq('id', subscriptionId).eq('customer_id', customerId).maybeSingle();
  if (!owned) return false;
  const { data: deliveries } = await client.from('subscription_deliveries').select('id,position,status,scheduled_date').eq('subscription_id', subscriptionId).eq('status', 'scheduled').order('position', { ascending: true });
  const list = (deliveries ?? []) as Array<{ id: string; position: number; scheduled_date: string }>;
  const targetIdx = list.findIndex((d) => d.id === deliveryId);
  if (targetIdx === -1) return false;
  const base = isSkip ? datesFrom(list[targetIdx]!.scheduled_date, owned.frequency as Frequency, 1)[0]! : newDate;
  const count = list.length - targetIdx;
  const dates = datesFrom(base, owned.frequency as Frequency, count);
  const { data: ok, error } = await client.rpc?.('reDateSubsequentDeliveries', { p_subscription_id: subscriptionId, p_from_position: list[targetIdx]!.position, p_dates: dates }) ?? { data: false, error: true };
  return !error && ok === true;
}

export const skipDelivery = (client: Client, id: string, customerId: string, deliveryId: string) => rescheduleDeliveries(client, id, customerId, deliveryId, '', true);
```

API routes (each a short Next route following the `tests/routes/subscription-account.test.ts` shape; the `GET` list/detail and `POST` pause/resume/cancel/reschedule/skip):

- `app/api/account/subscriptions/route.ts` — GET, auth, `listCustomerSubscriptions(getAdminSupabase(), customer.id)` → `{ items }`.
- `app/api/account/subscriptions/[id]/route.ts` — GET, auth, `getSubscriptionDetail`, 404 if not owned (`detail.customerId !== customer.id`).
- `app/api/account/subscriptions/[id]/pause/route.ts` — POST, auth, `pauseSubscription`.
- `app/api/account/subscriptions/[id]/resume/route.ts` — POST, auth, validate `nextDeliveryDate` `YYYY-MM-DD`, `resumeSubscription`.
- `app/api/account/subscriptions/[id]/cancel/route.ts` — POST, auth, `cancelSubscriptionWithCredit` (Task 6), returns `{ ok, creditMinor, giftCardCodeLast4 }`.
- `app/api/account/subscriptions/[id]/deliveries/[deliveryId]/reschedule/route.ts` — POST, auth, body `{ date }`, `rescheduleDeliveries(..., false)`.
- `app/api/account/subscriptions/[id]/deliveries/[deliveryId]/skip/route.ts` — POST, auth, `skipDelivery`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/domain/subscription-control-rpc-migration.test.ts tests/domain/subscription-control.test.ts tests/routes/subscription-account.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/033_subscriptions.sql features/subscriptions/control.ts app/api/account/subscriptions tests/domain/subscription-control-rpc-migration.test.ts tests/domain/subscription-control.test.ts tests/routes/subscription-account.test.ts
git commit -m "feat(subscriptions): add control RPCs and account API routes"
```

---

## Task 6: Store-credit issuance on cancellation (service)

**Files:**
- Modify: `features/subscriptions/service.ts` (append `cancelSubscriptionWithCredit`)
- Test: `tests/domain/subscription-cancel-credit.test.ts`

**Interfaces:**
- Consumes: Task 5 `cancel_subscription` RPC; gift-card crypto.
- Produces: `export async function cancelSubscriptionWithCredit(client, subscriptionId, customerId, opts: { actor: 'customer' | 'admin'; actorId?: string | null }, deps? ): Promise<CancelResult>` where `CancelResult = { ok: true; creditMinor: number; giftCardCodeLast4: string | null } | { ok: false; error: 'not_found' | 'already_cancelled' | 'unavailable' }`.
- Credit email is wired in Task 9.

- [ ] **Step 1: Write the failing test**

`tests/domain/subscription-cancel-credit.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import * as crypto from '@/features/gift-cards/crypto';
import { cancelSubscriptionWithCredit } from '@/features/subscriptions/service';

vi.mock('@/features/gift-cards/crypto', () => ({
  generateGiftCardCode: vi.fn(() => 'SUBS-1234'),
  hashGiftCardCode: vi.fn(() => 'hashed'),
  encryptGiftCardCode: vi.fn(() => 'enc'),
  maskGiftCardCode: vi.fn(() => '••••1234'),
}));
vi.mock('@/lib/server-env', () => ({ getRequiredServerEnv: vi.fn(() => 'secret'), getOptionalServerEnv: vi.fn(() => undefined) }));

function makeClient(o: Record<string, any> = {}) {
  const insert = vi.fn(async (row: Record<string, unknown>) => ({ data: {}, error: null, row }));
  return {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue(
        o.ownership === false ? { data: null, error: null } : { data: { id: 'sub1', price_minor: 120000, bundle_size: 4, frequency: 'weekly', locale: 'en', recipient_email: 'a@b.c', customer_name: 'A' }, error: null }),
      insert,
    })),
    rpc: vi.fn(async ({ name }) => name === 'cancel_subscription'
      ? { data: o.cancelResult ?? { cancelled: true, unmaterialized_count: 2 }, error: null }
      : { data: true, error: null }),
  } as any;
}

describe('cancelSubscriptionWithCredit', () => {
  it('rejects when not owned', async () => {
    const r = await cancelSubscriptionWithCredit(makeClient({ ownership: false }), 'sub1', 'cust1', { actor: 'customer', actorId: 'cust1' });
    expect(r.ok).toBe(false);
  });
  it('issues a gift card for the unmaterialized share (2 of 4 -> 60000)', async () => {
    const c = makeClient({});
    const r = await cancelSubscriptionWithCredit(c, 'sub1', 'cust1', { actor: 'customer', actorId: 'cust1' });
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.creditMinor).toBe(60000); expect(crypto.generateGiftCardCode).toHaveBeenCalled(); }
  });
  it('issues no card when nothing remains', async () => {
    const r = await cancelSubscriptionWithCredit(makeClient({ cancelResult: { cancelled: true, unmaterialized_count: 0 } }), 'sub1', 'cust1', { actor: 'customer', actorId: 'cust1' });
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.creditMinor).toBe(0); expect(r.giftCardCodeLast4).toBeNull(); }
  });
});
```

- [ ] **Step 2: Run test to verify it fails** → `npx vitest run tests/domain/subscription-cancel-credit.test.ts` → FAIL (not exported).

- [ ] **Step 3: Write minimal implementation**

Append to `features/subscriptions/service.ts`:

```ts
import { randomUUID } from 'node:crypto';
import { getRequiredServerEnv } from '@/lib/server-env';
import { generateGiftCardCode, hashGiftCardCode, encryptGiftCardCode, maskGiftCardCode } from '@/features/gift-cards/crypto';

export type CancelResult = { ok: true; creditMinor: number; giftCardCodeLast4: string | null } | { ok: false; error: 'not_found' | 'already_cancelled' | 'unavailable' };

export async function cancelSubscriptionWithCredit(
  client: Client, subscriptionId: string, customerId: string,
  opts: { actor: 'customer' | 'admin'; actorId?: string | null },
  deps: { now?: Date } = {},
): Promise<CancelResult> {
  const c = client as any;
  const { data: owned } = await c.from('subscriptions')
    .select('id,price_minor,bundle_size,frequency,locale,recipient_email,customer_id,subscription_plans(name_en)')
    .eq('id', subscriptionId).eq('customer_id', customerId).maybeSingle();
  if (!owned) return { ok: false, error: 'not_found' };
  const { data: cancelData, error: cancelError } = await c.rpc('cancel_subscription', { p_subscription_id: subscriptionId });
  if (cancelError) return { ok: false, error: 'unavailable' };
  if (!cancelData?.cancelled) return { ok: false, error: 'already_cancelled' };

  const unmaterialized = Number(cancelData.unmaterialized_count ?? 0);
  const bundleSize = Number(owned.bundle_size);
  const priceMinor = Number(owned.price_minor);
  const creditMinor = bundleSize > 0 ? Math.floor((priceMinor * unmaterialized) / bundleSize) : 0;
  let giftCardCodeLast4: string | null = null;

  if (creditMinor > 0) {
    const now = deps.now ?? new Date();
    const secret = getRequiredServerEnv('GIFT_CARD_SECRET');
    const code = generateGiftCardCode();
    const purchaseId = randomUUID();
    const cardId = randomUUID();
    const expiresAt = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString();
    const buyerEmail = String(owned.recipient_email ?? '').trim();
    const planName = String(owned.subscription_plans?.name_en ?? '');
    const row = {
      id: cardId, purchase_id: purchaseId, code_hash: hashGiftCardCode(code, secret), code_ciphertext: encryptGiftCardCode(code, secret),
      code_last4: code.replace(/-/g, '').slice(-4), initial_balance_minor: creditMinor, balance_minor: creditMinor,
      recipient_name: planName, recipient_email: buyerEmail, buyer_email: buyerEmail, status: 'active', locale: owned.locale ?? 'en',
      expires_at: expiresAt, delivery_status: 'sent', delivery_attempts: 1, activated_at: now.toISOString(), created_at: now.toISOString(),
    };
    const { error: cardError } = await c.from('gift_cards').insert(row);
    if (cardError) return { ok: false, error: 'unavailable' };
    await c.from('gift_card_purchases').insert({
      id: purchaseId, reference: `SUBREF-${subscriptionId}`, amount_minor: creditMinor, currency: 'EGP',
      sender_name: planName, sender_email: buyerEmail, recipient_name: planName, recipient_email: buyerEmail,
      message: 'Store credit from subscription cancellation', locale: owned.locale ?? 'en',
      status: 'paid', source: 'subscription_refund', delivery_status: 'sent', delivery_attempts: 1,
    });
    await c.from('gift_card_transactions').insert({
      gift_card_id: cardId, type: 'issue', amount_minor: creditMinor, actor_id: opts.actorId ?? null,
      idempotency_key: `subscription-refund:${subscriptionId}`, metadata: { source: 'subscription_refund' },
    });
    giftCardCodeLast4 = maskGiftCardCode(code);
    await c.from('subscription_events').insert({
      subscription_id: subscriptionId, actor: opts.actor, actor_id: opts.actorId ?? null,
      event_type: 'credit_issued', payload: { credit_minor: creditMinor, plan_name: planName },
    });
  }
  return { ok: true, creditMinor, giftCardCodeLast4 };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/domain/subscription-cancel-credit.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add features/subscriptions/service.ts tests/domain/subscription-cancel-credit.test.ts
git commit -m "feat(subscriptions): issue store credit on cancellation"
```

---

## Task 7: Subscription emails

**Files:**
- Create: `features/subscriptions/email.ts`
- Test: `tests/domain/subscription-email.test.ts`

**Interfaces:**
- Consumes: `escapeHtml` from `@/features/notifications/email-templates`; `createMailTransport`/`MailTransport` from `@/features/notifications/gmail-mailer`; `isEmailDeliveryDisabled`; server-env.
- Produces: `renderSubscriptionEmail(type, input): { subject; text; html }` and `sendSubscriptionEmail`; `SubscriptionEmailType = 'activated' | 'paused' | 'resumed' | 'renewal_nudge' | 'completed' | 'cancelled_credit'`.

- [ ] **Step 1: Write the failing test**

`tests/domain/subscription-email.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { renderSubscriptionEmail } from '@/features/subscriptions/email';
describe('subscription email rendering', () => {
  it('renders a renewal nudge with the code and plans link', () => {
    const out = renderSubscriptionEmail('renewal_nudge', { locale: 'en', planName: 'The Classic', code: 'ROS10-ABCD', plansUrl: 'https://shop/en/cairo/subscriptions' });
    expect(out.text).toContain('ROS10-ABCD');
    expect(out.html).toContain('ROS10-ABCD');
    expect(out.html).toContain('subscriptions');
  });
  it('renders cancelled_credit with the gift card code', () => {
    const out = renderSubscriptionEmail('cancelled_credit', { locale: 'en', planName: 'The Classic', code: 'ROSC-5678', creditMinor: 60000 });
    expect(out.text).toContain('ROSC-5678');
  });
  it('escapes plan names', () => {
    const out = renderSubscriptionEmail('completed', { locale: 'en', planName: '<b>Classic</b>', code: '' });
    expect(out.html).not.toContain('<b>Classic</b>');
  });
});
```

- [ ] **Step 2: Run test to verify it fails** → `npx vitest run tests/domain/subscription-email.test.ts` → FAIL (module missing).

- [ ] **Step 3: Write minimal implementation**

`features/subscriptions/email.ts`:

```ts
import { escapeHtml } from '@/features/notifications/email-templates';
import { createMailTransport, type MailTransport } from '@/features/notifications/gmail-mailer';
import { getOptionalServerEnv, getRequiredServerEnv } from '@/lib/server-env';
import { isEmailDeliveryDisabled } from '@/lib/runtime-config';

type Locale = 'en' | 'ar' | 'fr';
export type SubscriptionEmailType = 'activated' | 'paused' | 'resumed' | 'renewal_nudge' | 'completed' | 'cancelled_credit';
export type SubscriptionEmailInput = { locale: Locale; planName: string; code?: string; creditMinor?: number; plansUrl?: string };

const subjects: Record<SubscriptionEmailType, Record<Locale, string>> = {
  activated: { en: 'Your subscription is active', ar: 'اشتراكك نشط', fr: 'Votre abonnement est actif' },
  paused: { en: 'Your subscription is paused', ar: 'تم إيقاف اشتراكك مؤقتاً', fr: 'Votre abonnement est en pause' },
  resumed: { en: 'Your subscription is active again', ar: 'اشتراكك نشط مرة أخرى', fr: 'Votre abonnement est de nouveau actif' },
  renewal_nudge: { en: 'Time to renew your flower subscription', ar: 'حان وقت تجديد اشتراكك', fr: 'Il est temps de renouveler votre abonnement' },
  completed: { en: 'Your flower subscription is complete', ar: 'اكتمل اشتراكك', fr: 'Votre abonnement est terminé' },
  cancelled_credit: { en: 'Your store credit is ready', ar: 'رصيد المتجر جاهز', fr: 'Votre crédit boutique est prêt' },
};
const cta: Record<Locale, Record<SubscriptionEmailType, string>> = {
  en: { activated: 'View subscription', paused: '', resumed: '', renewal_nudge: 'Renew for 10% off', completed: 'Start a new subscription', cancelled_credit: 'Shop with your credit' },
  ar: { activated: 'عرض الاشتراك', paused: '', resumed: '', renewal_nudge: 'جدّد بخصم 10%', completed: 'ابدأ اشتراكاً جديداً', cancelled_credit: 'تسوق برصيدك' },
  fr: { activated: 'Voir l\u2019abonnement', paused: '', resumed: '', renewal_nudge: 'Renouveler avec -10%', completed: 'Démarrer un nouvel abonnement', cancelled_credit: 'Acheter avec votre crédit' },
};

export function renderSubscriptionEmail(type: SubscriptionEmailType, input: SubscriptionEmailInput): { subject: string; text: string; html: string } {
  const subject = `${subjects[type][input.locale]} · ${input.planName}`;
  const url = input.plansUrl ? escapeHtml(input.plansUrl) : '';
  const code = input.code ? escapeHtml(input.code) : '';
  const label = cta[input.locale][type];
  const button = label && url ? `<p style="margin:24px 0"><a href="${url}" style="background:#2d6a4f;color:#fff;padding:12px 20px;text-decoration:none;border-radius:4px">${escapeHtml(label)}</a></p>` : '';
  let body = '';
  if (type === 'renewal_nudge') body = input.locale === 'ar' ? `استخدم الرمز ${code} للحصول على خصم 10% عند التجديد.` : input.locale === 'fr' ? `Utilisez le code ${code} pour 10% de remise.` : `Use code ${code} for 10% off your next bundle.`;
  if (type === 'cancelled_credit') body = input.locale === 'ar' ? `تمت إضافة رصيد متجر. رمزك: ${code}` : input.locale === 'fr' ? `Un crédit boutique a été ajouté. Votre code : ${code}` : `Store credit added. Your code: ${code}`;
  const html = `<!doctype html><html lang="${input.locale}"><body style="font-family:Arial,sans-serif"><h1>${escapeHtml(subject)}</h1>${body ? `<p>${escapeHtml(body)}</p>` : ''}${button}</body></html>`;
  const text = `${subject}\n${body}${input.plansUrl ? `\n${input.plansUrl}` : ''}`;
  return { subject, text, html };
}

export async function sendSubscriptionEmail(input: SubscriptionEmailInput & { type: SubscriptionEmailType; to: string }, injectedTransport?: MailTransport): Promise<void> {
  if (!injectedTransport && isEmailDeliveryDisabled()) throw new Error('Email delivery disabled');
  const transport = injectedTransport ?? createMailTransport();
  const from = injectedTransport ? (getOptionalServerEnv('GMAIL_FROM') ?? 'Rosette <no-reply@example.invalid>') : getRequiredServerEnv('GMAIL_FROM');
  const { subject, text, html } = renderSubscriptionEmail(input.type, input);
  await transport.sendMail({ from, to: input.to, subject, text, html });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/domain/subscription-email.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add features/subscriptions/email.ts tests/domain/subscription-email.test.ts
git commit -m "feat(subscriptions): add subscription email rendering and sending"
```

---

## Task 8: Materialization RPC + cron passes 1 & 3 + webhook-adjacent catalog

**Files:**
- Modify: `supabase/migrations/033_subscriptions.sql` (append `materialize_subscription_delivery`)
- Create: `features/subscriptions/subscriptions-cron.ts`
- Create: `app/api/cron/subscriptions/route.ts`
- Test: `tests/domain/subscription-materialize-rpc-migration.test.ts`, `tests/domain/subscriptions-cron.test.ts`, `tests/routes/cron-subscriptions.test.ts`

**Interfaces:**
- Consumes: Task 2 tables; `reserve_order_inventory` (existing); `isCronAuthorizedForJob`.
- Produces: RPC `materialize_subscription_delivery(uuid, uuid) returns jsonb`; `runSubscriptionsCron(client, deps): Promise<SubscriptionCronSummary>`; `app/api/cron/subscriptions/route.ts`.

- [ ] **Step 1: Write the failing tests**

`tests/domain/subscription-materialize-rpc-migration.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
const sql = readFileSync(join('supabase/migrations', '033_subscriptions.sql'), 'utf8');
function fn(name: string): string {
  const s = sql.indexOf(`create or replace function public.${name}`);
  if (s === -1) return '';
  const e = sql.indexOf('$$;', s);
  return e === -1 ? '' : sql.slice(s, e);
}
describe('033 materialize RPC', () => {
  it('declares materialize_subscription_delivery security definer', () => {
    expect(sql).toContain('create or replace function public.materialize_subscription_delivery(');
    const b = fn('materialize_subscription_delivery');
    expect(b).toContain('security definer');
    expect(b).toMatch(/p_subscription_id uuid/);
    expect(b).toMatch(/p_delivery_id uuid/);
    expect(b).toMatch(/returns jsonb/);
  });
  it('guards on scheduled status for idempotency', () => {
    const b = fn('materialize_subscription_delivery');
    expect(b).toMatch(/status = 'scheduled'/);
    expect(b).toContain("'already_ordered'");
  });
  it('creates a zero-total, paid, confirmed order and reserves inventory', () => {
    const b = fn('materialize_subscription_delivery');
    expect(b).toContain("payment_status = 'paid'");
    expect(b).toContain("fulfillment_status = 'confirmed'");
    expect(b).toMatch(/delivery_fee_minor/);
    expect(b).toContain('public.reserve_order_inventory(');
  });
  it('grants service_role', () => {
    expect(sql).toContain('grant execute on function public.materialize_subscription_delivery(uuid, uuid) to service_role;');
  });
});
```

`tests/domain/subscriptions-cron.test.ts` (uses vitest `vi`; ensure imported at top):

```ts
import { describe, expect, it, vi } from 'vitest';
import { runSubscriptionsCron } from '@/features/subscriptions/subscriptions-cron';

describe('runSubscriptionsCron', () => {
  it('materializes due scheduled deliveries within the horizon', async () => {
    let ordered = false;
    const client = {
      from: (table: string) => {
        const base = {
          select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), gte: vi.fn().mockReturnThis(),
          lte: vi.fn().mockReturnThis(), is: vi.fn().mockReturnThis(), lt: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(), in: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(),
          update: vi.fn(async () => ({ data: {}, error: null })),
          insert: vi.fn(async () => ({ data: {}, error: null })),
        };
        if (table === 'subscriptions') return { ...base, select: vi.fn().mockReturnThis(), in: vi.fn().mockResolvedValue({ data: [{ id: 's1', status: 'active', frequency: 'weekly', first_delivery_date: '2026-09-12', bundle_size: 4, locale: 'en', renewal_nudge_sent_at: null, subscription_plans: { name_en: 'Plan' } , profiles: { email: 'a@b.c' } }], error: null }) };
        if (table === 'subscription_deliveries') return { ...base, select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), lte: vi.fn().mockResolvedValue({ data: [{ id: 'd1', status: 'scheduled', scheduled_date: '2026-09-15' }], error: null }) };
        return base;
      },
      rpc: vi.fn(async ({ name }) => {
        if (name === 'materialize_subscription_delivery') { ordered = true; return { data: { status: 'ordered' }, error: null }; }
        return { data: true, error: null };
      }),
    } as any;
    const summary = await runSubscriptionsCron(client, { today: new Date('2026-09-14T00:00:00Z'), origin: 'https://shop', send: async () => {} });
    expect(summary.materialized).toBe(1);
    expect(ordered).toBe(true);
  });
});
```

`tests/routes/cron-subscriptions.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/cron/subscriptions/route';
import * as cronLib from '@/lib/cron';
vi.mock('@/features/subscriptions/subscriptions-cron', () => ({ runSubscriptionsCron: vi.fn(async () => ({ materialized: 1, nudgesSent: 0, completed: 0, expired: 0, failed: 0 })) }));
describe('POST /api/cron/subscriptions', () => {
  it('rejects missing auth', async () => {
    vi.spyOn(cronLib, 'isCronAuthorizedForJob').mockReturnValue(false);
    const res = await POST(new Request('http://localhost/api/cron/subscriptions', { method: 'POST' }));
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails** → `npx vitest run tests/domain/subscription-materialize-rpc-migration.test.ts tests/domain/subscriptions-cron.test.ts tests/routes/cron-subscriptions.test.ts` → FAIL.

- [ ] **Step 3: Write minimal implementation**

Append to `supabase/migrations/033_subscriptions.sql`:

```sql
-- Materialize one scheduled delivery into a paid order (zero-total; money was booked
-- at bundle purchase) and reserve inventory.

create or replace function public.materialize_subscription_delivery(
  p_subscription_id uuid,
  p_delivery_id uuid
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_delivery record;
  v_sub record;
  v_product record;
  v_price_minor int;
  v_order_id uuid;
  v_display_number text;
  v_public_token text;
begin
  select d.id, d.position, d.status as dstatus into v_delivery
    from public.subscription_deliveries d
   where d.id = p_delivery_id and d.subscription_id = p_subscription_id;
  if v_delivery.id is null then return jsonb_build_object('status', 'not_found'); end if;
  if v_delivery.dstatus <> 'scheduled' then return jsonb_build_object('status', 'already_ordered'); end if;

  select s.product_id, s.variant_id, s.locale, s.recipient_name, s.recipient_phone,
         s.delivery_address, s.delivery_city_code, s.delivery_window, s.gift_message
    into v_sub from public.subscriptions s where s.id = p_subscription_id and s.status = 'active';
  if v_sub.product_id is null then return jsonb_build_object('status', 'not_active'); end if;

  select name_en, name_ar, name_fr into v_product from public.products p where p.id = v_sub.product_id;
  select coalesce(price_minor, 0) into v_price_minor from public.product_variants where id = v_sub.variant_id;

  v_display_number := 'RO-' || upper(to_hex(extract(epoch from clock_timestamp())::bigint)) || '-' || upper(substring(md5(random()::text) for 4));
  v_public_token := encode(extensions.gen_random_bytes(24), 'hex');

  insert into public.orders(
    display_number, public_token, customer_id, customer_email, customer_phone,
    recipient_name, recipient_phone, delivery_address, delivery_city_code, delivery_date, delivery_window, locale,
    subtotal_minor, delivery_fee_minor, total_minor, discount_minor,
    payment_status, fulfillment_status, subscription_id, subscription_delivery_id
  ) values (
    v_display_number, v_public_token, p_subscription_id, '', '',
    v_sub.recipient_name, v_sub.recipient_phone, v_sub.delivery_address, v_sub.delivery_city_code, v_delivery.scheduled_date, v_sub.delivery_window, v_sub.locale,
    0, 0, 0, 0, 'paid', 'confirmed', p_subscription_id, p_delivery_id
  ) returning id into v_order_id;

  insert into public.order_items(
    order_id, product_id, variant_id, product_slug, product_name_en, product_name_ar, product_name_fr,
    unit_price_minor, quantity, add_ons, gift_message
  ) values (
    v_order_id, v_sub.product_id, v_sub.variant_id, coalesce(v_product.name_en, ''),
    coalesce(v_product.name_en, ''), coalesce(v_product.name_ar, ''), coalesce(v_product.name_fr, ''),
    0, 1, '[]'::jsonb, coalesce(v_sub.gift_message, '')
  );

  perform public.reserve_order_inventory(v_order_id, jsonb_build_array(jsonb_build_object('variant_id', v_sub.variant_id, 'quantity', 1)));

  update public.subscription_deliveries set status = 'ordered', order_id = v_order_id, updated_at = now()
   where id = p_delivery_id;

  insert into public.order_events(order_id, event_type, from_status, to_status, metadata)
  values (v_order_id, 'subscription_materialized', 'scheduled', 'ordered',
          jsonb_build_object('subscription_id', p_subscription_id, 'delivery_position', v_delivery.position));
  insert into public.subscription_events(subscription_id, delivery_id, actor, event_type, payload)
  values (p_subscription_id, p_delivery_id, 'system', 'materialized', jsonb_build_object('order_id', v_order_id, 'position', v_delivery.position));

  return jsonb_build_object('status', 'ordered', 'order_id', v_order_id);
end;
$$;
grant execute on function public.materialize_subscription_delivery(uuid, uuid) to service_role;
```

`features/subscriptions/subscriptions-cron.ts`:

```ts
import type { Frequency } from './types';

type CronClient = { from: (table: string) => any; rpc?: (name: string, args: Record<string, unknown>) => any };
export type SubscriptionCronSummary = { materialized: number; nudgesSent: number; completed: number; expired: number; failed: number };
export const MATERIALIZE_HORIZON_DAYS = 2;

function dateRef(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}
function unshift(ref: string, days: number): string {
  const [y = 0, m = 1, d = 1] = ref.split('-').map(Number);
  return dateRef(new Date(Date.UTC(y, m - 1, d) + days * 86_400_000));
}

export async function runSubscriptionsCron(
  client: CronClient,
  deps: { today?: Date; origin: string; send?: (input: { type: string; to: string; locale: 'en' | 'ar' | 'fr'; planName: string; code?: string; plansUrl?: string }) => Promise<void> },
): Promise<SubscriptionCronSummary> {
  const s: SubscriptionCronSummary = { materialized: 0, nudgesSent: 0, completed: 0, expired: 0, failed: 0 };
  const today = dateRef(deps.today ?? new Date());
  const send = deps.send ?? (async () => {});
  const c = client as any;

  // Pass 1 — materialize
  const { data: subs } = await c.from('subscriptions')
    .select('id,status,frequency,bundle_size,locale,renewal_nudge_sent_at,subscription_plans(name_en),profiles(email)')
    .in('status', ['active']);
  for (const sub of (subs ?? []) as any[]) {
    const { data: due } = await c.from('subscription_deliveries')
      .select('id,status,scheduled_date').eq('subscription_id', sub.id).eq('status', 'scheduled')
      .lte('scheduled_date', unshift(today, MATERIALIZE_HORIZON_DAYS));
    for (const delivery of (due ?? []) as any[]) {
      const { data, error } = await c.rpc('materialize_subscription_delivery', { p_subscription_id: sub.id, p_delivery_id: delivery.id });
      if (!error && data?.status === 'ordered') s.materialized += 1; else s.failed += 1;
    }
  }

  // Pass 2 — nudge at 1 remaining / complete when empty (issuance ± email wiring done here)
  // (Fully implemented in Task 9; this task leaves a correct-but-email-less stub.)
  for (const sub of (subs ?? []) as any[]) {
    const { data: remaining } = await c.from('subscription_deliveries').select('id,status').eq('subscription_id', sub.id).eq('status', 'scheduled');
    const count = ((remaining ?? []) as any[]).length;
    if (count === 0 && sub.status === 'active') {
      const { error } = await c.from('subscriptions').update({ status: 'completed', completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', sub.id).eq('status', 'active');
      if (!error) s.completed += 1;
    }
  }

  // Pass 3 — expire stale pending_payment
  const cutoff = new Date((deps.today ?? new Date()).getTime() - 24 * 3600_000).toISOString();
  const { data: pending } = await c.from('subscriptions').select('id,checkout_order_id').eq('status', 'pending_payment').lt('created_at', cutoff);
  for (const p of (pending ?? []) as any[]) {
    s.expired += 1;
    await c.from('subscriptions').update({ status: 'cancelled', cancelled_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', p.id);
    if (p.checkout_order_id) await c.from('orders').update({ payment_status: 'cancelled' }).eq('id', p.checkout_order_id).in('payment_status', ['pending', 'payment_started', 'payment_failed']);
  }
  return s;
}
```

`app/api/cron/subscriptions/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getPublicOrigin } from '@/lib/origin';
import { logger } from '@/lib/logger';
import { isCronAuthorizedForJob } from '@/lib/cron';
import { runSubscriptionsCron } from '@/features/subscriptions/subscriptions-cron';

async function handle(request: Request) {
  if (!isCronAuthorizedForJob(request.headers.get('authorization'), 'SUBSCRIPTIONS')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const summary = await runSubscriptionsCron(getAdminSupabase(), { origin: getPublicOrigin(request) });
    logger.info('cron.subscriptions.completed', { summary });
    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    logger.error('cron.subscriptions.failed', { error });
    return NextResponse.json({ error: 'Subscription job failed' }, { status: 503 });
  }
}
export async function GET(request: Request) { return handle(request); }
export async function POST(request: Request) { return handle(request); }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/domain/subscription-materialize-rpc-migration.test.ts tests/domain/subscriptions-cron.test.ts tests/routes/cron-subscriptions.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/033_subscriptions.sql features/subscriptions/subscriptions-cron.ts app/api/cron/subscriptions/route.ts tests/domain/subscription-materialize-rpc-migration.test.ts tests/domain/subscriptions-cron.test.ts tests/routes/cron-subscriptions.test.ts
git commit -m "feat(subscriptions): add materialization RPC and daily cron"
```

---

## Task 9: Renewal code issuance + email wiring in cron + store-credit email

**Files:**
- Modify: `features/subscriptions/subscriptions-cron.ts` (Pass 2)
- Modify: `features/subscriptions/service.ts` (credit email)
- Test: `tests/domain/subscriptions-cron.test.ts` (extend)

**Interfaces:**
- Consumes: Task 7 `sendSubscriptionEmail`; existing `promo_codes` insert.

- [ ] **Step 1: Write the failing test (extend)**

Append to `tests/domain/subscriptions-cron.test.ts`:

```ts
it('issues a single-use promo code and emails the nudge for 1-remaining subscriptions', async () => {
  const promoInserts: string[] = [];
  const sends: string[] = [];
  const deliver = { data: [{ id: 'd1', status: 'scheduled', scheduled_date: '2026-09-15' }], error: null };
  const subs = [{ id: 's1', status: 'active', renewal_nudge_sent_at: null, subscription_plans: { name_en: 'Plan' } }];
  const client = {
    from: (table: string) => {
      if (table === 'promo_codes') return { insert: vi.fn(async (row: { code: string }) => { promoInserts.push(row.code); return { data: row, error: null }; }) };
      if (table === 'subscriptions') return {
        select: vi.fn().mockReturnThis(), in: vi.fn().mockResolvedValue({ data: subs, error: null }),
        update: vi.fn(async () => ({ data: {}, error: null })), is: vi.fn().mockResolvedValue({ data: [{ error: null }], error: null }),
        lt: vi.fn().mockResolvedValue({ data: [], error: null }),
      };
      if (table === 'subscription_deliveries') return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ data: deliver.data, error: null }), lte: vi.fn().mockResolvedValue({ data: deliver.data, error: null }) };
      return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }), update: vi.fn(async () => ({ data: {}, error: null })) };
    },
    rpc: vi.fn(async () => ({ data: { status: 'ordered' }, error: null })),
  } as any;
  await runSubscriptionsCron(client, { today: new Date('2026-09-14T00:00:00Z'), origin: 'https://shop', send: async (input) => { sends.push(input.type); } });
  expect(promoInserts.length).toBe(1);
  expect(sends).toContain('renewal_nudge');
});
```

- [ ] **Step 2: Run test to verify it fails** → `npx vitest run tests/domain/subscriptions-cron.test.ts` → FAIL (no nudge in current stub).

- [ ] **Step 3: Write minimal implementation**

In `features/subscriptions/subscriptions-cron.ts`, add the import `import { sendSubscriptionEmail } from './email';` and set `const send = deps.send ?? sendSubscriptionEmail;`. Replace Pass 2 with:

```ts
for (const sub of (subs ?? []) as any[]) {
  const { data: remaining } = await c.from('subscription_deliveries').select('id,status').eq('subscription_id', sub.id).eq('status', 'scheduled');
  const count = ((remaining ?? []) as any[]).length;
  const planName = String(sub.subscription_plans?.name_en ?? '');
  const to = String(sub.profiles?.email ?? '');
  if (count === 0 && sub.status === 'active' && !sub.renewal_nudge_sent_at) {
    const { error: compErr } = await c.from('subscriptions').update({ status: 'completed', completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', sub.id).eq('status', 'active');
    if (!compErr) {
      s.completed += 1;
      await send({ type: 'completed', to, locale: sub.locale, planName, plansUrl: `${deps.origin}/${sub.locale}/cairo/subscriptions` }).catch(() => { s.failed += 1; });
    }
  } else if (count === 1 && !sub.renewal_nudge_sent_at) {
    const code = `ROS10${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const expiresAt = new Date(Date.now() + 60 * 24 * 3600_000).toISOString();
    const { error: promoError } = await c.from('promo_codes').insert({ code, type: 'percent', percent_off: 10, minimum_order_minor: 0, starts_at: null, expires_at: expiresAt, max_uses: 1, used_count: 0, active: true });
    if (!promoError) {
      const { error: nudgeErr } = await c.from('subscriptions').update({ renewal_nudge_sent_at: new Date().toISOString(), renewal_promo_code: code, updated_at: new Date().toISOString() }).eq('id', sub.id).is('renewal_nudge_sent_at', null);
      if (!nudgeErr) {
        s.nudgesSent += 1;
        await send({ type: 'renewal_nudge', to, locale: sub.locale, planName, code, plansUrl: `${deps.origin}/${sub.locale}/cairo/subscriptions` }).catch(() => { s.failed += 1; });
      }
    }
  }
}
```

In `features/subscriptions/service.ts`, add import `import { sendSubscriptionEmail } from './email';` and, inside `cancelSubscriptionWithCredit` after the transaction inserts, when `giftCardCodeLast4` is set:

```ts
const buyerEmail = String(owned.recipient_email ?? '').trim();
if (buyerEmail) {
  await sendSubscriptionEmail({ type: 'cancelled_credit', to: buyerEmail, locale: owned.locale, planName: String(owned.subscription_plans?.name_en ?? ''), code, creditMinor }).catch(() => {});
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/domain/subscriptions-cron.test.ts tests/domain/subscription-cancel-credit.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add features/subscriptions/subscriptions-cron.ts features/subscriptions/service.ts tests/domain/subscriptions-cron.test.ts
git commit -m "feat(subscriptions): issue renewal promo codes and wire subscription emails"
```

---

## Task 10: Account dashboard UI + AccountShell nav

**Files:**
- Create: `features/subscriptions/SubscriptionsPanel.tsx`, `features/subscriptions/SubscriptionDetail.tsx`, `features/subscriptions/SubscriptionActions.tsx`
- Create: `app/[locale]/[city]/account/(dashboard)/subscriptions/page.tsx`, `.../subscriptions/[id]/page.tsx`
- Modify: `components/account/AccountShell.tsx`
- Test: `tests/components/SubscriptionsPanel.test.tsx`

**Interfaces:**
- Consumes: `listCustomerSubscriptions`, `getSubscriptionDetail` (server pages); `useI18n`/`useStorePath` (client); `useAsyncAction` (existing hook) for action buttons.

- [ ] **Step 1: Write the failing test**

`tests/components/SubscriptionsPanel.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SubscriptionsPanel } from '@/features/subscriptions/SubscriptionsPanel';
vi.mock('next/link', () => ({ default: ({ children, href }: any) => <a href={href}>{children}</a> }));
vi.mock('@/features/i18n/I18nProvider', () => ({ useI18n: () => ({ t: (k: string) => k }) }));
const items = [{ id: 's1', planNameEn: 'The Classic', status: 'active', frequency: 'weekly', bundleSize: 4, priceMinor: 120000, firstDeliveryDate: '2026-09-15', orderedCount: 1 }];
describe('SubscriptionsPanel', () => {
  it('renders plan name and progress', () => {
    render(<SubscriptionsPanel items={items} accountPath="/en/cairo/account" />);
    expect(screen.getByText('The Classic')).toBeTruthy();
    expect(screen.getByText('1 of 4')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails** → `npx vitest run tests/components/SubscriptionsPanel.test.tsx` → FAIL (component missing).

- [ ] **Step 3: Write minimal implementation**

`features/subscriptions/SubscriptionsPanel.tsx`:

```tsx
'use client';
import Link from 'next/link';
import { useI18n } from '@/features/i18n/I18nProvider';
export type SubscriptionListItem = { id: string; planNameEn: string; status: string; frequency: string; bundleSize: number; priceMinor: number; firstDeliveryDate: string; orderedCount: number };
export function SubscriptionsPanel({ items, accountPath }: { items: SubscriptionListItem[]; accountPath: string }) {
  const { t } = useI18n();
  if (items.length === 0) return <p className="py-6 text-sm text-on-surface-variant">{t('subscriptionsEmpty')}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-outline-variant/30">
            <th className="py-3 font-mono text-[0.875rem] font-normal text-on-surface-variant">{t('subscriptionPlan')}</th>
            <th className="py-3 font-mono text-[0.875rem] font-normal text-on-surface-variant">{t('status')}</th>
            <th className="py-3 font-mono text-[0.875rem] font-normal text-on-surface-variant">{t('subscriptionProgress')}</th>
            <th className="py-3 font-mono text-[0.875rem] font-normal text-on-surface-variant">{t('subscriptionNextDelivery')}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-b border-outline-variant/10 transition-colors hover:bg-surface-container-low">
              <td className="py-4 text-sm text-on-surface">
                <Link className="underline decoration-transparent underline-offset-4 hover:decoration-outline-variant" href={`${accountPath}/subscriptions/${item.id}`}>{item.planNameEn}</Link>
              </td>
              <td className="py-4 text-sm text-on-surface-variant">{item.status}</td>
              <td className="py-4 text-sm text-on-surface-variant">{item.orderedCount} of {item.bundleSize}</td>
              <td className="py-4 text-sm text-on-surface-variant">{item.firstDeliveryDate}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

`features/subscriptions/SubscriptionActions.tsx` — a client component rendering action buttons for a subscription detail (Pause, Resume, Cancel), each calling the matching API route via `fetch` wrapped in `useAsyncAction`, then `router.refresh()`. (The exact `useAsyncAction` signature is read from `hooks/useAsyncAction.tsx` during implementation; follow its existing usage in `CancelRequestButton`.)

`features/subscriptions/SubscriptionDetail.tsx` — a client component rendering recipient block + schedule table.

Server pages:
- `app/[locale]/[city]/account/(dashboard)/subscriptions/page.tsx` — follow the `occasions/page.tsx` pattern (`getCurrentCustomer` → redirect; `getAdminSupabase`; `listCustomerSubscriptions`; render header + `<SubscriptionsPanel items={} accountPath={`/${locale}/${city}/account`} />`).
- `.../subscriptions/[id]/page.tsx` — `getSubscriptionDetail`, 404 if not owned, render `<SubscriptionDetail `\`data={detail}\` />`.

Modify `components/account/AccountShell.tsx`:
- Add `import { PackageCheck... } from 'lucide-react';` (add `PackageCheck` to the existing lucide import).
- Add `subscriptionsHref = href('/account/subscriptions')`, `isSubscriptionsActive`, and a `<Link className={navClasses(isSubscriptionsActive)} href={subscriptionsHref}><PackageCheck/>...<span>{t('subscriptionsTitle')}</span></Link>` nav item.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/components/SubscriptionsPanel.test.tsx` → PASS.

- [ ] **Step 5: Commit**

```bash
git add features/subscriptions/SubscriptionsPanel.tsx features/subscriptions/SubscriptionDetail.tsx features/subscriptions/SubscriptionActions.tsx "app/[locale]/[city]/account/(dashboard)/subscriptions" components/account/AccountShell.tsx tests/components/SubscriptionsPanel.test.tsx
git commit -m "feat(subscriptions): add account dashboard UI and nav"
```

---

## Task 11: Storefront pages (landing + checkout) + i18n keys

**Files:**
- Create: `app/[locale]/[city]/subscriptions/page.tsx`
- Create: `features/subscriptions/SubscriptionCheckoutForm.tsx` (client)
- Create: `app/[locale]/[city]/subscriptions/[slug]/checkout/page.tsx` (server)
- Modify: `features/i18n/locales/en.json`, `ar.json`, `fr.json`
- Test: `tests/domain/i18n-dictionary.test.ts` (extend to assert subscription keys exist in all locales)

**Interfaces:**
- Consumes: `getActivePlans` (landing); `getPlanBySlug` (checkout); `useI18n`; gift-card/promo hooks from existing checkout (reuse `usePromoCode`).
- Produces: landing + checkout pages.

- [ ] **Step 1: Write the failing test**

Extend `tests/domain/i18n-dictionary.test.ts`:

```ts
it('defines every subscription* key in en, ar and fr', async () => {
  const { en, ar, fr } = await import('@/features/i18n/locales/en.json').then(() => ({ en: require('@/features/i18n/locales/en.json'), ar: require('@/features/i18n/locales/ar.json'), fr: require('@/features/i18n/locales/fr.json') }));
  const keys = ['subscriptionsTitle', 'subscriptionsLede', 'subscriptionPlan', 'subscriptionManage', 'subscriptionProgress', 'subscriptionNextDelivery', 'subscriptionsEmpty', 'subscriptionCheckoutTitle', 'subscriptionRecipientMe', 'subscriptionRecipientOther', 'subscriptionFrequency', 'subscriptionBundleSize', 'subscriptionFirstDelivery', 'subscriptionGiftMessage', 'subscriptionConfirmPurchase'];
  for (const k of keys) {
    expect(en[k], `en.${k}`).toBeTruthy();
    expect(ar[k], `ar.${k}`).toBeTruthy();
    expect(fr[k], `fr.${k}`).toBeTruthy();
  }
});
```

- [ ] **Step 2: Run test to verify it fails** → `npx vitest run tests/domain/i18n-dictionary.test.ts` → FAIL (keys missing).

- [ ] **Step 3: Write minimal implementation**

Add the subscription keys to `features/i18n/locales/en.json` (and Arabic/French equivalents):

```json
  "subscriptionsTitle": "Flower Subscriptions",
  "subscriptionsLede": "A hand-picked bouquet on your schedule.",
  "subscriptionPlan": "Plan",
  "subscriptionManage": "Manage",
  "subscriptionProgress": "Deliveries",
  "subscriptionNextDelivery": "Next delivery",
  "subscriptionsEmpty": "No subscriptions yet.",
  "subscriptionCheckoutTitle": "Start your subscription",
  "subscriptionRecipientMe": "Deliver to me",
  "subscriptionRecipientOther": "Deliver to someone else",
  "subscriptionFrequency": "Frequency",
  "subscriptionBundleSize": "Bouquets",
  "subscriptionFirstDelivery": "First delivery",
  "subscriptionGiftMessage": "Gift message",
  "subscriptionConfirmPurchase": "Start subscription"
```

Modify `app/api/webhooks/paymob/route.ts` — add the subscription activation branch (see Task 4). *(Referenced for completeness; no change here.)*

`app/[locale]/[city]/subscriptions/page.tsx` — server component following the `occasions/page.tsx` pattern; fetch `getActivePlans(getAdminSupabase())`, render a hero + plans grid where each card links to `/subscriptions/{slug}/checkout`.

`features/subscriptions/SubscriptionCheckoutForm.tsx` — client form: plan from props; frequency/bundle-size selectors; recipient toggle; city/address; first delivery date (min = today+1 per lead time); window; gift message; promo + gift-card hooks (reuse the existing checkout's `usePromoCode` and gift-card quote machinery); on submit POST `/api/subscriptions`, then redirect to `checkoutUrl` (or the order page when `checkoutUrl` is null). Wire `turnstileToken` like the existing `CheckoutForm`.

`app/[locale]/[city]/subscriptions/[slug]/checkout/page.tsx` — server component, auth-required (`getCurrentCustomer` → redirect to login), fetch plan by slug, render the heading + `<SubscriptionCheckoutForm plan={} />`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/domain/i18n-dictionary.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add "app/[locale]/[city]/subscriptions" features/subscriptions/SubscriptionCheckoutForm.tsx features/i18n/locales/en.json features/i18n/locales/ar.json features/i18n/locales/fr.json tests/domain/i18n-dictionary.test.ts
git commit -m "feat(subscriptions): add storefront landing and checkout pages"
```

---

## Task 12: Admin API + admin-actions + admin UI (plans CRUD, subscribers, timeline)

**Files:**
- Create: `features/subscriptions/admin-actions.ts`
- Create: `app/api/admin/subscriptions/route.ts`, `[id]/cancel/route.ts`, `plans/route.ts`, `plans/[id]/route.ts`
- Create: `features/subscriptions/AdminSubscribersTable.tsx`, `AdminTimeline.tsx`, `AdminPlanForm.tsx`
- Create: `app/admin/subscriptions/page.tsx`, `plans/page.tsx`, `plans/new/page.tsx`, `plans/[id]/page.tsx`
- Modify: `components/admin/AdminShell.tsx`, `components/admin/AppSidebar.tsx`
- Test: `tests/routes/subscription-admin.test.ts` (small), `tests/domain/subscription-admin-actions.test.ts`

**Interfaces:**
- Consumes: `getCurrentAdmin`, `canOperate`-style authorization from `@/features/admin/authorization`; `PageHeader`, shadcn `Card`/`Badge`/`Button`/`Input`; `getServerT`.
- Produces: admin list/detail/cancel; plans CRUD; subscribers table; timeline; nav links.

- [ ] **Step 1: Write the failing tests**

`tests/domain/subscription-admin-actions.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { listAdminSubscriptions } from '@/features/subscriptions/admin-actions';
describe('admin subscription actions', () => {
  it('is gated behind operator/admin authorization', async () => {
    const client = { from: () => ({ select: async () => ({ data: [], error: null }) }) } as any;
    const out = await listAdminSubscriptions(client, { role: 'viewer', userId: 'u' }, {});
    expect(out).toEqual([]);
  });
});
```

`tests/routes/subscription-admin.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/admin/subscriptions/route';
import * as adminAuth from '@/features/auth/server';
describe('GET /api/admin/subscriptions', () => {
  it('returns 401 for a non-admin', async () => {
    vi.spyOn(adminAuth, 'getCurrentAdmin').mockResolvedValue(null);
    const res = await GET(new Request('http://localhost/api/admin/subscriptions'));
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails** → both FAIL (modules/route missing).

- [ ] **Step 3: Write minimal implementation**

`features/subscriptions/admin-actions.ts`:

```ts
import type { AdminIdentity } from '@/features/admin/authorization';
type Client = { from: (table: string) => any; rpc?: (name: string, args: Record<string, unknown>) => any };
function canOperate(identity: AdminIdentity) { return identity.role === 'admin' || identity.role === 'operator'; }

export async function listAdminSubscriptions(client: Client, identity: AdminIdentity, filters: { status?: string }): Promise<Record<string, any>[]> {
  if (!canOperate(identity)) return [];
  const q = client.from('subscriptions').select('*,subscription_plans(name_en,slug),profiles(email)').order('created_at', { ascending: false });
  const { data } = filters.status ? await q.eq('status', filters.status) : await q;
  return ((data ?? []) as any[]).map((row) => ({ id: String(row.id), planName: String(row.subscription_plans?.name_en ?? ''), status: row.status, frequency: row.frequency, bundleSize: Number(row.bundle_size), priceMinor: Number(row.price_minor), customerEmail: String(row.profiles?.email ?? ''), createdAt: String(row.created_at) }));
}

export async function getAdminTimeline(client: Client, days = 14): Promise<Record<string, any>[]> {
  const today = new Date();
  const from = today.toISOString();
  const to = new Date(today.getTime() + days * 86_400_000).toISOString();
  const { data } = await client.from('subscription_deliveries')
    .select('id,scheduled_date,status,subscription_id,order_id,subscriptions(subscription_plans(name_en),recipient_name,delivery_city_code,delivery_window)')
    .gte('scheduled_date', from.slice(0, 10)).lte('scheduled_date', to.slice(0, 10));
  return ((data ?? []) as any[]).map((row) => ({
    id: String(row.id), scheduledDate: String(row.scheduled_date), status: row.status,
    orderId: row.order_id ? String(row.order_id) : null,
    planName: String(row.subscriptions?.subscription_plans?.name_en ?? ''),
    recipient: String(row.subscriptions?.recipient_name ?? ''), city: String(row.subscriptions?.delivery_city_code ?? ''), window: String(row.subscriptions?.delivery_window ?? ''),
  }));
}
```

`app/api/admin/subscriptions/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { getCurrentAdmin } from '@/features/auth/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { listAdminSubscriptions } from '@/features/subscriptions/admin-actions';
export async function GET(request: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const status = new URL(request.url).searchParams.get('status') ?? undefined;
  const items = await listAdminSubscriptions(getAdminSupabase(), admin, { status });
  return NextResponse.json({ items });
}
```

`app/api/admin/subscriptions/[id]/cancel/route.ts` — POST, `getCurrentAdmin`, call `cancelSubscriptionWithCredit(getAdminSupabase(), id, sub.customerId, { actor: 'admin', actorId: admin.userId })` after resolving ownership; audit-log the cancellation.

`app/api/admin/subscriptions/plans/route.ts` — GET (list all plans) + POST (create); POST validates + inserts into `subscription_plans`.

`app/api/admin/subscriptions/plans/[id]/route.ts` — GET/PATCH/DELETE plan.

Admin pages (`app/admin/subscriptions/page.tsx` = subscribers + timeline tabs; `plans/page.tsx` = list; `plans/new`, `plans/[id]` = create/edit) — follow the `gift-cards/page.tsx` pattern: `getCurrentAdmin` → redirect; `getServerT`; `PageHeader`; shadcn cards; render `AdminSubscribersTable`, `AdminTimeline`, `AdminPlanForm`, `AdminSubscriptionActions` (cancel).

Modify `components/admin/AdminShell.tsx`: add `{ href: '/admin/subscriptions', key: 'subscriptionsTitle' }` to `NAV_ITEMS`.
Modify `components/admin/AppSidebar.tsx`: add `'/admin/subscriptions': Repeat` (or `PackageCheck`) to `ICONS` and import it.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/domain/subscription-admin-actions.test.ts tests/routes/subscription-admin.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add features/subscriptions/admin-actions.ts app/api/admin/subscriptions app/admin/subscriptions features/subscriptions/AdminSubscribersTable.tsx features/subscriptions/AdminTimeline.tsx features/subscriptions/AdminPlanForm.tsx components/admin/AdminShell.tsx components/admin/AppSidebar.tsx tests/domain/subscription-admin-actions.test.ts tests/routes/subscription-admin.test.ts
git commit -m "feat(subscriptions): add admin API and UI"
```

---

## Task 13: Admin dashboard tiles + final integration check

**Files:**
- Modify: `features/admin/dashboard-stats.ts`
- Modify: admin dashboard page (the page that renders `computeDashboardStats`)
- Test: `tests/domain/dashboard-stats.test.ts` (extend)

**Interfaces:**
- Consumes: existing `computeDashboardStats`; subscription list via admin client.
- Produces: two new tiles — active subscription count and deliveries this week.

- [ ] **Step 1: Write the failing test**

Extend `tests/domain/dashboard-stats.test.ts`:

```ts
import { computeSubscriptionTiles } from '@/features/admin/dashboard-stats';
it('computes active subscribers and deliveries this week', () => {
  const { activeSubscriptions, deliveriesThisWeek } = computeSubscriptionTiles([
    { status: 'active' }, { status: 'active' }, { status: 'paused' },
  ], [
    { status: 'scheduled', scheduled_date: '2026-09-15' }, { status: 'scheduled', scheduled_date: '2026-09-30' }, { status: 'ordered' },
  ], new Date('2026-09-13T00:00:00Z'));
  expect(activeSubscriptions).toBe(2);
  // week = 2026-09-13..2026-09-19
  expect(deliveriesThisWeek).toBe(1);
});
```

- [ ] **Step 2: Run test to verify it fails** → `npx vitest run tests/domain/dashboard-stats.test.ts` → (function not exported).

- [ ] **Step 3: Write minimal implementation**

In `features/admin/dashboard-stats.ts` append:

```ts
export function computeSubscriptionTiles(
  subscriptions: Array<{ status: string }>,
  deliveries: Array<{ status: string; scheduled_date: string }>,
  now: Date = new Date(),
): { activeSubscriptions: number; deliveriesThisWeek: number } {
  const activeSubscriptions = subscriptions.filter((s) => s.status === 'active').length;
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const end = start + 7 * 86_400_000;
  const deliveriesThisWeek = deliveries.filter((d) => {
    const t = new Date(`${d.scheduled_date}T00:00:00Z`).getTime();
    return (d.status === 'scheduled' || d.status === 'ordered') && t >= start && t < end;
  }).length;
  return { activeSubscriptions, deliveriesThisWeek };
}
```

On the admin dashboard page, after fetching stats, query `subscriptions` (status) and `subscription_deliveries` (scheduled_date + status) for the next 14 days and render two tiles (active subs count, deliveries this week) using `computeSubscriptionTiles`, styled like the existing stat tiles.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/domain/dashboard-stats.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add features/admin/dashboard-stats.ts app/admin/page.tsx tests/domain/dashboard-stats.test.ts
git commit -m "feat(subscriptions): add admin dashboard subscription tiles"
```

---

## Task 14: Full-suite verification

- [ ] **Step 1: Run the whole test suite**

Run: `npx vitest run`
Expected: all tests pass, including existing ones.

- [ ] **Step 2: Lint** (follow the repo's lint command from package.json — e.g. `npm run lint`)

Run the repo's lint/typecheck and fix any issues introduced by the new files.

- [ ] **Step 3: Manual smoke** (optional, if a dev server route exists)

If the app runs locally (`npm run dev`), smoke: login → `/subscriptions` → pick a plan → `/subscriptions/[slug]/checkout` → demo-card → account `/account/subscriptions` → skip/reschedule/pause. Confirm the account shell nav shows "Subscriptions" and the admin shell nav shows it too.

- [ ] **Step 4: Commit any stragglers**

If lint/typecheck changed files, commit them.

```bash
git add -u
git commit -m "chore(subscriptions): final integration fixes"
```

---

## Self-Review Notes (addressed)

- **Spec coverage** — every spec section has a task: schema (2), purchase+activation (3,4), lifecycle/cron (8), controls+account API (5), credit (6), renewals/emails (9), account UI (10), storefront (11), admin (12), dashboard tiles (13), out-of-scope items intentionally excluded.
- **Placeholder scan** — dates/names/signatures all concrete; the materialization lead-time and horizon are explicit (`1` day lead time in validation, `2`-day horizon in cron). Where a runtime dep was referenced but not live (e.g. storefront Turnstile token), the plan points at the existing pattern (`CheckoutForm`) to copy rather than inventing a signature.
- **Type consistency** — `Frequency`/`DateRef`/`SubscriptionStatus`/`Plan` are defined once in `types.ts`/`schedule.ts` and imported everywhere; the RPC return shapes (`{ ok, value }`) and control/Admin function signatures are repeated verbatim in interfaces blocks so later tasks compile against earlier ones.
- **Known runtime risk to verify during implementation:** the exact return shapes of `create_subscription_order` / `materialize_subscription_delivery` RPCs and the exact `useSalesAsync`/`usePromoCode`/`useAsyncAction` signatures — the tests mock these, but the live webhook path re-uses `supabase.rpc` so implementers should confirm field names match at Task 4/8/12.

---