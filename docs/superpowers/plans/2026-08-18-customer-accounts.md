# Customer Accounts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add shopper accounts — email/password sign-up & sign-in, a profile, order history, and automatic linking of orders placed while signed in — while keeping guest checkout.

**Architecture:** Supabase Auth with a Postgres trigger that auto-creates a `profiles` row (role `customer`) on signup. Customer reads are RLS-scoped via the session client. New `/account/*` routes (auth pages + a dashboard shell), a shared `getCurrentCustomer()` server helper, an account repository + profile actions, and checkout sets `orders.customer_id` from the session.

**Tech Stack:** Next.js 16 (App Router), React 19, Tailwind CSS v4, shadcn/ui, Supabase (`@supabase/ssr`), TypeScript, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-08-18-customer-accounts-design.md`

## Global Constraints

- No new dependencies. Use `getServerSupabase()`/`getBrowserSupabase()`/`getAdminSupabase()` already in `lib/supabase/`.
- Guest checkout unchanged: `customer_id` stays `null` and orders remain trackable by phone/token.
- Admin auth (`/login`, `getCurrentAdmin`, admin role check) untouched.
- Storefront stays statically renderable — no server session read in the root layout (nav/checkout session checks are client-side on mount).
- All customer-facing copy localized EN/AR/FR via `features/i18n/dictionaries.ts`; the `i18n-dictionary` test enforces ar/fr ⊇ en keys.
- TDD for logic/components: write the failing test, confirm red, implement, confirm green, commit per task.
- Migration files must be idempotent (`create or replace`, `drop ... if exists`, `on conflict do nothing`).
- Baseline test count: 196. Expected final: 213 (17 new).

---

### Task 1: i18n keys (EN/AR/FR)

**Files:**
- Modify: `features/i18n/dictionaries.ts`

**Interfaces:**
- Produces: new message keys consumed by Tasks 6–9 (`signUp`, `account`, `forgotPassword`, `resetPassword`, `name`, `phone`, `noOrdersYet`, `profile`, `myOrders`, `signUpFailed`, `passwordUpdated`, `resetEmailSent`, `newPassword`, `orderingAs`, `saveProfile`, `profileSaved`, `couldNotSaveProfile`, `viewOrder`, `backToAccount`).

- [ ] **Step 1: Add keys to all three locales**

Add these keys to the `en`, `ar`, and `fr` objects (place them right after `authNotConfigured` in each):

`en`:
```ts
signUp: 'Create account',
account: 'Account',
forgotPassword: 'Forgot password?',
resetPassword: 'Reset password',
name: 'Name',
phone: 'Phone',
noOrdersYet: 'No orders yet.',
profile: 'Profile',
myOrders: 'My orders',
signUpFailed: 'We could not create your account.',
passwordUpdated: 'Your password has been updated.',
resetEmailSent: 'If an account exists for that email, a reset link is on its way.',
newPassword: 'New password',
orderingAs: 'Ordering as {email} — it will appear in your account.',
saveProfile: 'Save profile',
profileSaved: 'Profile updated.',
couldNotSaveProfile: 'Could not update your profile.',
viewOrder: 'View order',
backToAccount: 'Back to account',
```

`ar`:
```ts
signUp: 'إنشاء حساب',
account: 'حسابي',
forgotPassword: 'نسيت كلمة المرور؟',
resetPassword: 'إعادة تعيين كلمة المرور',
name: 'الاسم',
phone: 'الهاتف',
noOrdersYet: 'لا توجد طلبات بعد.',
profile: 'الملف الشخصي',
myOrders: 'طلباتي',
signUpFailed: 'تعذر إنشاء حسابك.',
passwordUpdated: 'تم تحديث كلمة المرور.',
resetEmailSent: 'إذا كان هناك حساب لهذا البريد، فسيصلك رابط إعادة التعيين.',
newPassword: 'كلمة مرور جديدة',
orderingAs: 'الطلب باسم {email} — سيظهر في حسابك.',
saveProfile: 'حفظ الملف الشخصي',
profileSaved: 'تم تحديث الملف الشخصي.',
couldNotSaveProfile: 'تعذر تحديث ملفك الشخصي.',
viewOrder: 'عرض الطلب',
backToAccount: 'العودة إلى الحساب',
```

`fr`:
```ts
signUp: 'Créer un compte',
account: 'Mon compte',
forgotPassword: 'Mot de passe oublié ?',
resetPassword: 'Réinitialiser le mot de passe',
name: 'Nom',
phone: 'Téléphone',
noOrdersYet: 'Aucune commande pour l’instant.',
profile: 'Profil',
myOrders: 'Mes commandes',
signUpFailed: 'Impossible de créer votre compte.',
passwordUpdated: 'Votre mot de passe a été mis à jour.',
resetEmailSent: 'Si un compte existe pour cet e-mail, un lien de réinitialisation est en route.',
newPassword: 'Nouveau mot de passe',
orderingAs: 'Commande en tant que {email} — elle apparaîtra dans votre compte.',
saveProfile: 'Enregistrer le profil',
profileSaved: 'Profil mis à jour.',
couldNotSaveProfile: 'Impossible de mettre à jour votre profil.',
viewOrder: 'Voir la commande',
backToAccount: 'Retour au compte',
```

- [ ] **Step 2: Verify**

Run: `npx vitest run tests/domain/i18n-dictionary.test.ts`
Expected: PASS (the "ar/fr superset of en" assertion now covers the new keys).

- [ ] **Step 3: Commit**

```bash
git add features/i18n/dictionaries.ts
git commit -m "Add customer account i18n keys (EN/AR/FR)"
```

---

### Task 2: Migration `005_customer_accounts.sql`

**Files:**
- Create: `supabase/migrations/005_customer_accounts.sql`

**Interfaces:**
- Produces: `public.handle_new_user()` trigger (profiles auto-creation), UPDATE policy on `profiles`, role-escalation guard, backfill. Consumed by the Supabase apply step in the runbook (Task 10).

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/005_customer_accounts.sql`:

```sql
-- Customer accounts: auto-create a profile on signup, let customers edit their
-- own profile, and block customers from changing their own role.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, role, created_at)
  values (new.id, 'customer', now())
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

drop policy if exists "users can update own profile" on public.profiles;
create policy "users can update own profile"
  on public.profiles
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Defense in depth: a non-admin must never be able to promote their own role.
create or replace function public.prevent_role_escalation()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.role is distinct from old.role then
    if not exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'operator')
    ) then
      raise exception 'ROLE_CHANGE_FORBIDDEN';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_role_escalation on public.profiles;
create trigger prevent_role_escalation
  before update on public.profiles
  for each row execute procedure public.prevent_role_escalation();

-- Backfill profiles for any existing auth.users that lack one.
insert into public.profiles (id, role, created_at)
select u.id, 'customer', now()
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id)
on conflict (id) do nothing;
```

- [ ] **Step 2: Self-check idempotency** — every statement is `create or replace` / `drop ... if exists` / `on conflict do nothing`; re-running is safe.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/005_customer_accounts.sql
git commit -m "Add customer accounts migration (signup trigger, profile update policy)"
```

---

### Task 3: `getCurrentCustomer` server helper

**Files:**
- Create: `features/auth/customer.ts`
- Test: `tests/domain/customer-auth.test.ts`

**Interfaces:**
- Produces: `getCurrentCustomer(client?)` → `Promise<{ id: string; email: string; displayName: string; phone: string } | null>`. Consumed by the account pages (Task 8) and the orders route (Task 9).

- [ ] **Step 1: Write the failing test**

Create `tests/domain/customer-auth.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { getCurrentCustomer } from '@/features/auth/customer';

function fakeClient(user: { id: string; email: string } | null, profile: { display_name: string | null; phone: string | null } | null) {
  return {
    auth: { getUser: async () => ({ data: { user } }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: profile }) }) }) }),
  } as never;
}

describe('getCurrentCustomer', () => {
  it('returns the user with profile when signed in', async () => {
    const customer = await getCurrentCustomer(fakeClient({ id: 'u1', email: 'a@b.c' }, { display_name: 'Nour', phone: '0100' }));
    expect(customer).toEqual({ id: 'u1', email: 'a@b.c', displayName: 'Nour', phone: '0100' });
  });

  it('returns null without a session', async () => {
    expect(await getCurrentCustomer(fakeClient(null, null))).toBeNull();
  });

  it('returns null when the profile row is missing', async () => {
    expect(await getCurrentCustomer(fakeClient({ id: 'u1', email: 'a@b.c' }, null))).toBeNull();
  });
});
```

- [ ] **Step 2: Confirm red** — `npx vitest run tests/domain/customer-auth.test.ts` fails (module not found).

- [ ] **Step 3: Implement**

Create `features/auth/customer.ts`:

```ts
import { getServerSupabase } from '@/lib/supabase/server';

type SupabaseLike = NonNullable<Awaited<ReturnType<typeof getServerSupabase>>>;

export type CurrentCustomer = { id: string; email: string; displayName: string; phone: string };

export async function getCurrentCustomer(client?: SupabaseLike): Promise<CurrentCustomer | null> {
  const supabase = client ?? await getServerSupabase();
  if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from('profiles').select('display_name,phone').eq('id', user.id).maybeSingle();
  if (!profile) return null;
  return { id: user.id, email: user.email ?? '', displayName: profile.display_name ?? '', phone: profile.phone ?? '' };
}
```

- [ ] **Step 4: Confirm green** — `npx vitest run tests/domain/customer-auth.test.ts` passes (3/3).

- [ ] **Step 5: Commit**

```bash
git add features/auth/customer.ts tests/domain/customer-auth.test.ts
git commit -m "Add getCurrentCustomer server helper"
```

---

### Task 4: Account repository

**Files:**
- Create: `features/account/account-repository.ts`
- Test: `tests/domain/account-repository.test.ts`

**Interfaces:**
- Produces: `CustomerOrderSummary`, `CustomerOrderDetail`, `listCustomerOrders(client, userId)`, `getCustomerOrder(client, userId, orderId)`. Consumed by the account orders pages (Task 8).

- [ ] **Step 1: Write the failing test**

Create `tests/domain/account-repository.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { listCustomerOrders, getCustomerOrder } from '@/features/account/account-repository';

function fakeListClient(rows: unknown[]) {
  return {
    from: () => ({
      select: () => ({ eq: () => ({ order: async () => ({ data: rows, error: null }) }) }),
    }),
  } as never;
}

function fakeDetailClient(row: unknown | null) {
  return {
    from: () => ({
      select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) }) }),
    }),
  } as never;
}

describe('listCustomerOrders', () => {
  it('maps order rows to summaries', async () => {
    const orders = await listCustomerOrders(fakeListClient([
      { id: 'o1', display_number: 'RO-1', created_at: '2026-08-18T00:00:00Z', total_minor: 12000, payment_status: 'paid', fulfillment_status: 'confirmed' },
    ]), 'u1');
    expect(orders).toEqual([{ id: 'o1', displayNumber: 'RO-1', createdAt: '2026-08-18T00:00:00Z', totalMinor: 12000, paymentStatus: 'paid', fulfillmentStatus: 'confirmed' }]);
  });

  it('returns an empty list when there are no rows', async () => {
    expect(await listCustomerOrders(fakeListClient([]), 'u1')).toEqual([]);
  });
});

describe('getCustomerOrder', () => {
  it('returns the mapped detail when the order belongs to the customer', async () => {
    const detail = await getCustomerOrder(fakeDetailClient({
      id: 'o1', display_number: 'RO-1', created_at: '2026-08-18T00:00:00Z', recipient_name: 'Maya',
      delivery_address: '12 Garden St', delivery_date: '2026-08-20', delivery_window: '12-3',
      subtotal_minor: 10500, delivery_fee_minor: 1500, total_minor: 12000, payment_status: 'paid',
      fulfillment_status: 'confirmed', order_items: [], order_events: [],
    }), 'u1', 'o1');
    expect(detail?.displayNumber).toBe('RO-1');
    expect(detail?.items).toEqual([]);
    expect(detail?.events).toEqual([]);
  });

  it('returns null when the order is not found', async () => {
    expect(await getCustomerOrder(fakeDetailClient(null), 'u1', 'o1')).toBeNull();
  });
});
```

- [ ] **Step 2: Confirm red** — `npx vitest run tests/domain/account-repository.test.ts` fails.

- [ ] **Step 3: Implement**

Create `features/account/account-repository.ts`:

```ts
type AccountClient = { from: (table: string) => any };

export type CustomerOrderSummary = {
  id: string; displayNumber: string; createdAt: string; totalMinor: number;
  paymentStatus: string; fulfillmentStatus: string;
};

export type CustomerOrderDetail = {
  id: string; displayNumber: string; createdAt: string;
  recipientName: string; deliveryAddress: string; deliveryDate: string; deliveryWindow: string;
  subtotalMinor: number; deliveryFeeMinor: number; totalMinor: number;
  paymentStatus: string; fulfillmentStatus: string;
  items: Array<{ id: string; nameEn: string; nameAr: string; nameFr: string; unitPriceMinor: number; quantity: number; addOns: Array<{ id: string; name: string; price: number }> }>;
  events: Array<{ id: string; eventType: string; fromStatus: string | null; toStatus: string | null; createdAt: string }>;
};

export async function listCustomerOrders(client: AccountClient, userId: string): Promise<CustomerOrderSummary[]> {
  const { data } = await client.from('orders')
    .select('id,display_number,created_at,total_minor,payment_status,fulfillment_status')
    .eq('customer_id', userId)
    .order('created_at', { ascending: false });
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id), displayNumber: String(row.display_number), createdAt: String(row.created_at),
    totalMinor: Number(row.total_minor), paymentStatus: String(row.payment_status), fulfillmentStatus: String(row.fulfillment_status),
  }));
}

export async function getCustomerOrder(client: AccountClient, userId: string, orderId: string): Promise<CustomerOrderDetail | null> {
  const { data } = await client.from('orders')
    .select('*,order_items(*),order_events(*)')
    .eq('id', orderId)
    .eq('customer_id', userId)
    .maybeSingle();
  const order = data as Record<string, any> | null;
  if (!order) return null;
  return {
    id: order.id, displayNumber: order.display_number, createdAt: order.created_at,
    recipientName: order.recipient_name, deliveryAddress: order.delivery_address,
    deliveryDate: order.delivery_date, deliveryWindow: order.delivery_window,
    subtotalMinor: order.subtotal_minor, deliveryFeeMinor: order.delivery_fee_minor, totalMinor: order.total_minor,
    paymentStatus: order.payment_status, fulfillmentStatus: order.fulfillment_status,
    items: (order.order_items ?? []).map((item: any) => ({
      id: item.id, nameEn: item.product_name_en ?? '', nameAr: item.product_name_ar ?? '', nameFr: item.product_name_fr ?? '',
      unitPriceMinor: item.unit_price_minor, quantity: item.quantity,
      addOns: Array.isArray(item.add_ons) ? item.add_ons.map((addOn: any) => ({ id: String(addOn.id ?? ''), name: String(addOn.name ?? addOn.name_en ?? ''), price: Number(addOn.price ?? addOn.price_minor ?? 0) })) : [],
    })),
    events: (order.order_events ?? []).map((event: any) => ({
      id: event.id, eventType: event.event_type, fromStatus: event.from_status ?? null, toStatus: event.to_status ?? null, createdAt: event.created_at,
    })),
  };
}
```

- [ ] **Step 4: Confirm green** — `npx vitest run tests/domain/account-repository.test.ts` passes (4/4).

- [ ] **Step 5: Commit**

```bash
git add features/account/account-repository.ts tests/domain/account-repository.test.ts
git commit -m "Add account order repository (list + detail, customer-scoped)"
```

---

### Task 5: Profile validation + update (pure logic)

**Files:**
- Create: `features/account/profile.ts`
- Test: `tests/domain/account-profile.test.ts`

**Interfaces:**
- Produces: `validateProfile(input)`, `updateProfileRecord(client, userId, input)` (returns `'saved' | 'failure'`). Consumed by `features/account/actions.ts` (Task 8).

- [ ] **Step 1: Write the failing test**

Create `tests/domain/account-profile.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { validateProfile, updateProfileRecord } from '@/features/account/profile';

describe('validateProfile', () => {
  it('rejects a blank name', () => {
    expect(validateProfile({ displayName: '   ', phone: '' })).toBe('invalid_name');
  });

  it('trims and accepts a phone-free profile', () => {
    expect(validateProfile({ displayName: ' Nour ', phone: '' })).toBeNull();
  });

  it('rejects an over-long phone', () => {
    expect(validateProfile({ displayName: 'Nour', phone: '0'.repeat(51) })).toBe('invalid_phone');
  });
});

describe('updateProfileRecord', () => {
  it('updates display_name and phone for the given user', async () => {
    let updated: unknown = null;
    const client = { from: () => ({ update: (payload: unknown) => ({ eq: async () => ({ error: null }) }) }) } as never;
    const result = await updateProfileRecord(client, 'u1', { displayName: 'Nour', phone: '0100' });
    expect(result).toBe('saved');
  });

  it('returns failure on update error', async () => {
    const client = { from: () => ({ update: () => ({ eq: async () => ({ error: { message: 'x' } }) }) }) } as never;
    expect(await updateProfileRecord(client, 'u1', { displayName: 'Nour', phone: '' })).toBe('failure');
  });
});
```

- [ ] **Step 2: Confirm red** — `npx vitest run tests/domain/account-profile.test.ts` fails.

- [ ] **Step 3: Implement**

Create `features/account/profile.ts`:

```ts
type ProfileInput = { displayName: string; phone: string };
type ProfileClient = { from: (table: string) => any };

export function validateProfile(input: ProfileInput): 'invalid_name' | 'invalid_phone' | null {
  if (!input.displayName.trim()) return 'invalid_name';
  if (input.phone.trim().length > 50) return 'invalid_phone';
  return null;
}

export async function updateProfileRecord(client: ProfileClient, userId: string, input: ProfileInput): Promise<'saved' | 'failure'> {
  const { error } = await client.from('profiles')
    .update({ display_name: input.displayName.trim(), phone: input.phone.trim() })
    .eq('id', userId);
  return error ? 'failure' : 'saved';
}
```

- [ ] **Step 4: Confirm green** — `npx vitest run tests/domain/account-profile.test.ts` passes (5/5).

- [ ] **Step 5: Commit**

```bash
git add features/account/profile.ts tests/domain/account-profile.test.ts
git commit -m "Add customer profile validation and update logic"
```

---

### Task 6: `AccountNavItem` + header integration

**Files:**
- Create: `components/layout/AccountNavItem.tsx`
- Modify: `components/layout/SiteHeader.tsx`
- Test: `tests/components/AccountNavItem.test.tsx`

**Interfaces:**
- Consumes: `getBrowserSupabase()` (`lib/supabase/browser.ts`), `useI18n()`.
- Produces: `AccountNavItem` (no props) — "Sign in" link when signed out, "Account" link when signed in.

- [ ] **Step 1: Write the failing test**

Create `tests/components/AccountNavItem.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { renderWithProviders } from './test-utils';

vi.mock('@/lib/supabase/browser', () => ({
  getBrowserSupabase: vi.fn(),
}));

import { getBrowserSupabase } from '@/lib/supabase/browser';
import { AccountNavItem } from '@/components/layout/AccountNavItem';

const mockGetBrowserSupabase = vi.mocked(getBrowserSupabase);

beforeEach(() => vi.clearAllMocks());

describe('AccountNavItem', () => {
  it('shows "Sign in" when signed out', () => {
    mockGetBrowserSupabase.mockReturnValue({ auth: { getUser: async () => ({ data: { user: null } }) } } as never);
    renderWithProviders(<AccountNavItem />);
    return Promise.resolve().then(() => expect(screen.getByText('Sign in').closest('a')).toHaveAttribute('href', '/account/login'));
  });

  it('shows "Account" when signed in', () => {
    mockGetBrowserSupabase.mockReturnValue({ auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) } } as never);
    renderWithProviders(<AccountNavItem />);
    return Promise.resolve().then(() => expect(screen.getByText('Account').closest('a')).toHaveAttribute('href', '/account'));
  });
});
```

- [ ] **Step 2: Confirm red** — `npx vitest run tests/components/AccountNavItem.test.tsx` fails.

- [ ] **Step 3: Implement `AccountNavItem`**

Create `components/layout/AccountNavItem.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getBrowserSupabase } from '@/lib/supabase/browser';
import { useI18n } from '@/features/i18n/I18nProvider';

export function AccountNavItem() {
  const { t } = useI18n();
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const supabase = getBrowserSupabase();
      if (!supabase) return;
      const { data: { user } } = await supabase.auth.getUser();
      if (active) setSignedIn(Boolean(user));
    })();
    return () => { active = false; };
  }, []);

  return <Link href={signedIn ? '/account' : '/account/login'}>{signedIn ? t('account') : t('signIn')}</Link>;
}
```

- [ ] **Step 4: Integrate into `SiteHeader`**

In `components/layout/SiteHeader.tsx`:
- Add `import { AccountNavItem } from './AccountNavItem';`.
- In the desktop `<nav>` (after the `<Link href="/track">…`), add `<AccountNavItem />`.
- In the mobile `Sheet` nav (after the `/track` link), add `<Link>`-free row: wrap `<AccountNavItem />` in a `<div className="rounded-xl px-4 py-3 hover:bg-accent">`.

- [ ] **Step 5: Confirm green** — `npx vitest run tests/components/AccountNavItem.test.tsx` passes (2/2); `npx tsc --noEmit` clean.

- [ ] **Step 6: Commit**

```bash
git add components/layout/AccountNavItem.tsx components/layout/SiteHeader.tsx tests/components/AccountNavItem.test.tsx
git commit -m "Add account nav item to the site header"
```

---

### Task 7: Customer auth pages

**Files:**
- Create: `app/account/login/page.tsx`
- Create: `app/account/signup/page.tsx`
- Create: `app/account/forgot-password/page.tsx`
- Create: `app/account/reset-password/page.tsx`

**Interfaces:**
- Consumes: `getBrowserSupabase()`, `useI18n()`, `Field`/`Button`/`StatusMessage`.

- [ ] **Step 1: `/account/login`**

Copy the existing `app/login/page.tsx` structure, but:
- Heading uses `t('signIn')` and subtitle `t('account')`.
- `signInWithPassword` → `router.push('/account')`.
- Add a `<Link href="/account/signup">{t('signUp')}</Link>` and a `<Link href="/account/forgot-password">{t('forgotPassword')}</Link>` below the form.

- [ ] **Step 2: `/account/signup`**

Form with `email` + `password` fields; on submit `await supabase.auth.signUp({ email: email.trim(), password })`; if `error` → `setError(t('signUpFailed'))`; else `router.push('/account')` + `router.refresh()`. Link back to `/account/login`.

- [ ] **Step 3: `/account/forgot-password`**

Form with one `email` field; on submit `await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/account/reset-password` })`; always show `t('resetEmailSent')` (tone success) regardless of `error`.

- [ ] **Step 4: `/account/reset-password`**

Form with one `newPassword` field; on submit `await supabase.auth.updateUser({ password })`; on `error` show `t('signInFailed')`-style error; else show `t('passwordUpdated')` then `router.push('/account/login')`. Note in a comment that the recovery session is established from the email link.

- [ ] **Step 5: Verify** — `npx tsc --noEmit` clean; `npx vitest run` stays green.

- [ ] **Step 6: Commit**

```bash
git add app/account/login app/account/signup app/account/forgot-password app/account/reset-password
git commit -m "Add customer auth pages (signup, login, forgot, reset password)"
```

---

### Task 8: Account dashboard (shell, profile, orders)

**Files:**
- Create: `components/account/AccountShell.tsx`
- Create: `components/account/ProfileForm.tsx`
- Create: `features/account/actions.ts`
- Create: `app/account/(dashboard)/layout.tsx`
- Create: `app/account/(dashboard)/page.tsx`
- Create: `app/account/(dashboard)/orders/page.tsx`
- Create: `app/account/(dashboard)/orders/[id]/page.tsx`

**Interfaces:**
- Consumes: `getCurrentCustomer`, `listCustomerOrders`, `getCustomerOrder`, `validateProfile`/`updateProfileRecord`, `getServerSupabase`, `getServerT`, `formatMoney`, `fulfillmentLabel`/`paymentLabel`/`fulfillmentBadgeVariant`/`paymentBadgeVariant`, `Badge`/`Card`/`Button`/`StatusMessage`.

- [ ] **Step 1: `components/account/AccountShell.tsx`** (client)

A thin nav + container. Use `usePathname()` to highlight the active tab:

```tsx
'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useI18n } from '@/features/i18n/I18nProvider';

export function AccountShell({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const pathname = usePathname();
  const tab = (href: string) => (pathname === href || pathname.startsWith(`${href}/`) ? 'text-primary' : 'text-muted-foreground');
  return (
    <div className="mx-auto w-[min(calc(100%-3rem),80rem)] py-12 pb-24 max-md:w-[min(calc(100%-2rem),80rem)] max-md:pt-4">
      <p className="text-xs font-bold uppercase tracking-[.16em] text-sage">{t('account')}</p>
      <nav className="mt-3 flex gap-4 border-b text-sm">
        <Link className={`px-1 pb-2 ${tab('/account')}`} href="/account">{t('profile')}</Link>
        <Link className={`px-1 pb-2 ${tab('/account/orders')}`} href="/account/orders">{t('myOrders')}</Link>
      </nav>
      <div className="pt-8">{children}</div>
    </div>
  );
}
```

- [ ] **Step 2: `features/account/actions.ts`** (`'use server'`)

```ts
'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getServerSupabase } from '@/lib/supabase/server';
import { getCurrentCustomer } from '@/features/auth/customer';
import { validateProfile, updateProfileRecord } from './profile';

export async function updateProfile(input: { displayName: string; phone: string }): Promise<'saved' | 'invalid_name' | 'invalid_phone' | 'unauthenticated' | 'failure'> {
  const customer = await getCurrentCustomer();
  if (!customer) return 'unauthenticated';
  const invalid = validateProfile(input);
  if (invalid) return invalid;
  const supabase = await getServerSupabase();
  if (!supabase) return 'failure';
  const result = await updateProfileRecord(supabase, customer.id, input);
  if (result === 'saved') revalidatePath('/account');
  return result;
}

export async function signOutCustomer() {
  const supabase = await getServerSupabase();
  if (supabase) await supabase.auth.signOut();
  redirect('/account/login');
}
```

- [ ] **Step 3: `components/account/ProfileForm.tsx`** (client)

Form with `Field` for `name` + `phone`, submits via the `updateProfile` server action, shows `profileSaved` on success / `couldNotSaveProfile` on failure. Takes initial values as props (`initialName`, `initialPhone`).

- [ ] **Step 4: `app/account/(dashboard)/layout.tsx`**

```tsx
import { AccountShell } from '@/components/account/AccountShell';

export default function AccountDashboardLayout({ children }: { children: React.ReactNode }) {
  return <AccountShell>{children}</AccountShell>;
}
```

- [ ] **Step 5: `app/account/(dashboard)/page.tsx`** (profile)

```tsx
import { redirect } from 'next/navigation';
import { getCurrentCustomer } from '@/features/auth/customer';
import { ProfileForm } from '@/components/account/ProfileForm';
import { signOutCustomer } from '@/features/account/actions';

export default async function AccountProfilePage() {
  const customer = await getCurrentCustomer();
  if (!customer) redirect('/account/login');
  return (
    <section className="grid max-w-[34rem] gap-5 rounded-2xl border bg-card p-8 shadow-sm">
      <p className="text-sm text-muted-foreground">{customer.email}</p>
      <ProfileForm initialName={customer.displayName} initialPhone={customer.phone} />
      <form action={signOutCustomer}>
        <button type="submit" className="text-sm text-muted-foreground underline underline-offset-4">…sign out…</button>
      </form>
    </section>
  );
}
```

(Use the `signOut` i18n key for the button label.)

- [ ] **Step 6: `app/account/(dashboard)/orders/page.tsx`**

```tsx
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { StatusMessage } from '@/components/ui/status-message';
import { getCurrentCustomer } from '@/features/auth/customer';
import { listCustomerOrders } from '@/features/account/account-repository';
import { getServerSupabase } from '@/lib/supabase/server';
import { getServerT } from '@/features/i18n/server';
import { formatMoney } from '@/features/money';
import { fulfillmentLabel, fulfillmentBadgeVariant } from '@/features/admin/status-labels';

export default async function AccountOrdersPage() {
  const customer = await getCurrentCustomer();
  if (!customer) redirect('/account/login');
  const supabase = await getServerSupabase();
  const { t, locale } = await getServerT();
  const orders = supabase ? await listCustomerOrders(supabase, customer.id) : [];
  if (!orders.length) return <StatusMessage title={t('noOrdersYet')} />;
  return (
    <ul className="grid gap-3">
      {orders.map((order) => (
        <li key={order.id} className="flex items-center justify-between gap-4 rounded-2xl border bg-card p-4 shadow-sm">
          <div>
            <Link className="font-bold text-primary underline-offset-4 hover:underline" href={`/account/orders/${order.id}`}>{order.displayNumber}</Link>
            <p className="text-sm text-muted-foreground">{new Date(order.createdAt).toLocaleDateString(locale === 'ar' ? 'ar-EG' : locale === 'fr' ? 'fr-FR' : 'en-GB')}</p>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant={fulfillmentBadgeVariant(order.fulfillmentStatus)}>{fulfillmentLabel(order.fulfillmentStatus, t)}</Badge>
            <strong>{formatMoney(order.totalMinor, locale)}</strong>
          </div>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 7: `app/account/(dashboard)/orders/[id]/page.tsx`**

Fetch `getCustomerOrder(supabase, customer.id, id)`; if `null` → `notFound()`. Render: `display_number` heading, payment + fulfillment badges, recipient/delivery card, items card (map with `formatMoney`), totals (`subtotal`/`delivery`/`total` via `formatMoney`), and a timeline from `events` (locale-aware `toLocaleString`), plus a `backToAccount` link.

- [ ] **Step 8: Verify** — `npx tsc --noEmit` clean; `npx vitest run` stays green.

- [ ] **Step 9: Commit**

```bash
git add components/account features/account/actions.ts app/account
git commit -m "Add account dashboard (profile, orders, order detail)"
```

---

### Task 9: Checkout linking + signed-in notice

**Files:**
- Create: `features/order/order-insert.ts`
- Modify: `features/order/supabase-repository.ts`
- Modify: `features/order/types.ts`
- Modify: `app/api/orders/route.ts`
- Create: `features/checkout/SignedInNotice.tsx`
- Modify: `features/checkout/CheckoutForm.tsx`
- Test: `tests/domain/order-insert.test.ts`
- Test: `tests/components/SignedInNotice.test.tsx`

**Interfaces:**
- Consumes: `getCurrentCustomer` (route), `getServerSupabase`.
- Produces: `buildOrderInsertRow(params)` (with `customer_id`), `SignedInNotice` (no props).

- [ ] **Step 1: Write failing tests**

Create `tests/domain/order-insert.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildOrderInsertRow } from '@/features/order/order-insert';

const base = {
  number: 'RO-1', publicToken: 'tok', customerEmail: 'a@b.c', customerPhone: '0100',
  recipientName: 'Maya', recipientPhone: '0100', deliveryAddress: 'addr', deliveryCityCode: 'alexandria',
  deliveryDate: '2026-08-20', deliveryWindow: '12-3', locale: 'en', subtotalMinor: 10000,
  deliveryFeeMinor: 1500, discountMinor: 0, promoCode: null, totalMinor: 11500,
};

describe('buildOrderInsertRow', () => {
  it('sets customer_id when provided', () => {
    expect(buildOrderInsertRow({ ...base, customerId: 'u1' }).customer_id).toBe('u1');
  });

  it('sets customer_id to null when absent', () => {
    expect(buildOrderInsertRow(base).customer_id).toBeNull();
  });
});
```

Create `tests/components/SignedInNotice.test.tsx` (same `getBrowserSupabase` mock pattern as Task 6):

```tsx
it('shows the ordering-as line when signed in', …expect text /ordering as/i + email…);
it('renders nothing when signed out', …expect container empty…);
```

- [ ] **Step 2: Confirm red** — both test files fail (modules not found).

- [ ] **Step 3: Implement `features/order/order-insert.ts`**

Extract the insert row from `supabaseOrderRepository.createPending` (no behavior change):

```ts
export function buildOrderInsertRow(params: {
  number: string; publicToken: string; customerId?: string | null;
  customerEmail: string; customerPhone: string; recipientName: string; recipientPhone: string;
  deliveryAddress: string; deliveryCityCode: string; deliveryDate: string; deliveryWindow: string;
  locale: string; subtotalMinor: number; deliveryFeeMinor: number; discountMinor: number;
  promoCode: string | null; totalMinor: number;
}): Record<string, unknown> {
  return {
    display_number: params.number,
    public_token: params.publicToken,
    customer_id: params.customerId ?? null,
    customer_email: params.customerEmail.trim(),
    customer_phone: params.customerPhone.trim(),
    recipient_name: params.recipientName.trim(),
    recipient_phone: params.recipientPhone.trim(),
    delivery_address: params.deliveryAddress.trim(),
    delivery_city_code: params.deliveryCityCode,
    delivery_date: params.deliveryDate,
    delivery_window: params.deliveryWindow,
    locale: params.locale,
    subtotal_minor: params.subtotalMinor,
    delivery_fee_minor: params.deliveryFeeMinor,
    discount_minor: params.discountMinor,
    promo_code: params.promoCode,
    total_minor: params.totalMinor,
    payment_status: 'pending',
    fulfillment_status: 'confirmed',
  };
}
```

- [ ] **Step 4: Use it in `supabaseOrderRepository.createPending`**

Replace the inline `supabase.from('orders').insert({ ... })` object with `buildOrderInsertRow({ number, publicToken, customerId: input.customerId, customerEmail: input.checkout.senderEmail, customerPhone: input.checkout.recipientPhone, recipientName: input.checkout.recipientName, recipientPhone: input.checkout.recipientPhone, deliveryAddress: input.checkout.address, deliveryCityCode: input.destination.cityCode, deliveryDate: input.checkout.deliveryDate, deliveryWindow: input.checkout.deliveryWindow, locale: input.locale, subtotalMinor: totals.subtotal, deliveryFeeMinor: totals.deliveryFee, discountMinor, promoCode, totalMinor: totals.total })`.

- [ ] **Step 5: Type + route**

- In `features/order/types.ts`, add `customerId?: string | null;` to `CreatePendingOrderInput`.
- In `app/api/orders/route.ts`: import `getCurrentCustomer` from `@/features/auth/customer`; before `createPending`, add `const customer = await getCurrentCustomer();` and pass `customerId: customer?.id ?? null` in the `createPending` call. (This reuses the tested helper; guests get `null`.)

- [ ] **Step 6: `features/checkout/SignedInNotice.tsx`** (client)

Same session-check pattern as `AccountNavItem`; when signed in, render `<p className="text-sm text-muted-foreground">{t('orderingAs', { email })}</p>`, else `null`.

- [ ] **Step 7: Integrate into `CheckoutForm`**

In `features/checkout/CheckoutForm.tsx`, add `import { SignedInNotice } from './SignedInNotice';` and render `<SignedInNotice />` at the top of the `<form>` (before the `whoFor` section).

- [ ] **Step 8: Verify** — `npx vitest run tests/domain/order-insert.test.ts tests/components/SignedInNotice.test.tsx` passes (4 total); `npx tsc --noEmit` clean.

- [ ] **Step 9: Commit**

```bash
git add features/order/order-insert.ts features/order/supabase-repository.ts features/order/types.ts app/api/orders/route.ts features/checkout/SignedInNotice.tsx features/checkout/CheckoutForm.tsx tests/domain/order-insert.test.ts tests/components/SignedInNotice.test.tsx
git commit -m "Link orders to the signed-in customer and show a checkout notice"
```

---

### Task 10: Final verification gate + runbook

**Files:**
- Modify: `docs/setup/runbook.md`

- [ ] **Step 1: Runbook additions** — under the Supabase section, add: apply `005_customer_accounts.sql`; Auth → disable "Confirm email"; Auth → SMTP (Gmail app password) for password-recovery email.

- [ ] **Step 2:** `npx vitest run` — expect 213/213 green.

- [ ] **Step 3:** `npx tsc --noEmit` — clean.

- [ ] **Step 4:** `npm run build` — compiles.

- [ ] **Step 5:** `git diff --check` — clean.

- [ ] **Step 6:** Secret scan (`tests/security/no-secrets.test.ts`) — pass.

- [ ] **Step 7:** Whole-branch review — confirm only intended files changed (no admin/storefront UI churn, no `package.json`, no changes to `getCurrentAdmin`/`/login`).

- [ ] **Step 8:** Record rulings in `.superpowers/sdd/` and commit the runbook.

```bash
git add docs/setup/runbook.md
git commit -m "Document customer account setup steps in the runbook"
```
