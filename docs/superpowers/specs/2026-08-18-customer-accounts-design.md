# Customer Accounts Design

**Goal:** Give shoppers real accounts — sign-up/sign-in (email + password), a profile, order history, and automatic linking of orders placed while signed in — while keeping guest checkout available. Built on the Supabase Auth + `profiles` infrastructure that already powers admin sign-in.

**Non-goals:** No loyalty program, no saved addresses, no admin CRUD for customers, no changes to the admin auth flow, no changes to the existing public order tracking (`/track`, `/orders/[id]`).

## Approach

Supabase Auth (email + password) with a Postgres trigger that auto-creates a `profiles` row (role `customer`) on signup. Customer reads are RLS-scoped to the signed-in user; checkout reads the session to set `orders.customer_id`. Admin keeps its existing `/login`; customers get their own `/account/*` surface.

## 1. Data model & auth foundation

**New migration `supabase/migrations/005_customer_accounts.sql`** (idempotent):

- `public.handle_new_user()` trigger on `auth.users` (AFTER INSERT) → inserts `profiles(id, role, created_at)` with role `'customer'`. Wrapped in `drop trigger if exists` / `create or replace function` so it re-runs safely.
- **UPDATE policy** on `public.profiles` — `using (auth.uid() = id)` — so customers can edit their own `display_name`/`phone`. (Today only the SELECT policy from `002_profiles_policy.sql` exists.)
- Backfill: insert a `profiles` row for any existing `auth.users` row that lacks one (`role` `'customer'`).
- Reuse the existing `orders.customer_id uuid references profiles(id)` column and RLS policies (`customers read own orders`, `customers read own items`); no schema change to `orders`.

**Auth behavior:**

- **Sign-up** = `supabase.auth.signUp({ email, password })`; the trigger creates the profile. Email confirmation stays **off** so signup is instant (documented in the runbook). Name/phone are captured later in the profile.
- **Sign-in** = `signInWithPassword`; customers land on `/account`, admins on `/admin` (role is already on `profiles`).
- **Password reset** uses Supabase's recovery email via custom SMTP (Gmail app password); covered in the runbook, not code.

## 2. Customer auth pages & navigation

Client components (matching the existing `/login` pattern: `getBrowserSupabase()` + `Field`/`Button`/`StatusMessage`):

- **`/account/signup`** — email + password → `signUp()` → redirect `/account`.
- **`/account/login`** — email + password → `signInWithPassword()` → redirect `/account`.
- **`/account/forgot-password`** — email → `resetPasswordForEmail(email, { redirectTo: origin + '/account/reset-password' })`; show the success message regardless of outcome (no account enumeration).
- **`/account/reset-password`** — receives the recovery link, prompts for a new password → `updateUser({ password })` → redirect `/account/login`.

**Navigation:**

- New client component **`AccountNavItem`** in `SiteHeader` (desktop nav + mobile `Sheet`): checks the browser session on mount; shows **"Sign in"** → `/account/login` when signed out, **"Account"** → `/account` when signed in. Client-side so the storefront stays statically renderable.
- New server helper **`features/auth/customer.ts`** — `getCurrentCustomer()` returns the signed-in user + profile (`{ id, email, displayName, phone }`) or `null`, mirroring `getCurrentAdmin()` but role-agnostic.
- New i18n keys in EN/AR/FR (exact copy finalized in the plan): `signUp`, `account`, `forgotPassword`, `resetPassword`, `name`, `phone`, `noOrdersYet`, plus account/profile-specific labels and success/error messages.

## 3. Account dashboard

A lightweight **`AccountShell`** (nav: Profile | Orders, shadcn cards) wraps the account routes:

- **`/account`** — Profile tab (server component). `getCurrentCustomer()` → redirect `/account/login` if signed out. Shows email (read-only, from auth) and a client `ProfileForm` to edit `displayName` + `phone` via a server action. Sign-out button.
- **`/account/orders`** — Orders tab (server component). Lists the customer's orders (number, date, total, localized status badge) linking to the detail page; empty state via `StatusMessage` (`noOrdersYet`).
- **`/account/orders/[id]`** — order detail (server component). Same status timeline + items + totals as the public order page, scoped to the signed-in customer; not found / not theirs → 404.

**Data & actions:**

- **`features/account/account-repository.ts`** — `listCustomerOrders(userId)` and `getCustomerOrder(userId, orderId)` (items + events), using the session client so RLS scopes reads to the customer.
- **`features/account/actions.ts`** (`'use server'`) — `updateProfile({ displayName, phone })` (validate + trim, update own `profiles` row via the UPDATE policy, `revalidatePath`) and `signOutCustomer()` (sign out → redirect `/account/login`).

## 4. Link orders at checkout

- **`CreatePendingOrderInput`** gains `customerId?: string | null`.
- **Orders route** (`app/api/orders/route.ts`) reads the session via `getServerSupabase().auth.getUser()` and passes `customerId: user?.id ?? null` to `createPending`.
- **`supabaseOrderRepository.createPending`** adds `customer_id: input.customerId ?? null` to the insert. The local demo repo ignores it.
- **Signed-in indicator:** a client component (`SignedInNotice`) inside `CheckoutForm` reads the browser session on mount and shows a subtle line — "Ordering as {email} — it'll appear in your account." — when logged in; nothing when guest.

## 5. Error handling

- Auth form errors reuse the `StatusMessage`/`signInFailed` pattern; new signup/reset-specific error keys.
- Guest checkout is unaffected: `customer_id` stays `null` and orders remain trackable via phone/token as today.
- Account pages redirect to `/account/login` when the session is absent (server-side), so unauthenticated access never renders account data.

## 6. Testing & verification

Fakes + unit/component tests (no live services, no browser), TDD in an isolated worktree:

1. `getCurrentCustomer` — returns user+profile; `null` without session; `null` without a profile row.
2. `updateProfile` — trims, enforces length limits, allows empty phone, rejects invalid input.
3. `account-repository` — `listCustomerOrders` filters by `customer_id` and maps rows; `getCustomerOrder` returns detail with items/events or `null`.
4. Order linking — `createPending` includes `customer_id` when provided, `null` when absent.
5. `AccountNavItem` — "Sign in" without a session, "Account" with one.
6. `SignedInNotice` — shows the email line when signed in, nothing when guest.
7. i18n — new keys present in all three locales (existing `i18n-dictionary` test).
8. Full gate: tests (~210 total), `tsc --noEmit`, `npm run build`, `git diff --check`, secret scan.

## 7. Runbook (documented, not code)

Supabase dashboard settings to note in `docs/setup/runbook.md`: Auth → disable "Confirm email"; Auth → SMTP configured with the Gmail app password for password-recovery emails; apply `005_customer_accounts.sql`.
