# Abandoned-Cart Recovery Emails Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist shoppers' carts server-side, capture their email before checkout, and email a single recovery reminder 24h after they abandon the cart.

**Architecture:** A `carts` table (one active row per email) is written via a service-role sync route, fed by a signed-in auto-sync component and an opt-in guest email field on the cart page. Order placement marks the cart converted. A CRON_SECRET-guarded cron finds stale, unconverted, un-emailed carts and sends a cart-shaped recovery email through the gmail mailer; the email links back to `/cart?restore=<token>` which restores the saved bag.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Supabase (service-role writes, RLS no policies), nodemailer/Gmail, Vitest + Testing Library, CRON_SECRET cron guard.

**Spec:** `docs/superpowers/specs/2026-08-19-abandoned-cart-design.md`

## Global Constraints

- One recovery email per cart: `last_emailed_at` is stamped only on a successful send (failures retry next run).
- Abandonment threshold: `updated_at < now() - 24 hours`.
- One active cart per email: partial unique index `(email) where converted_at is null`.
- Guest sync rate limit: 5 syncs per email per minute (in-process, 12s window).
- Email `from` address uses `GMAIL_FROM` (required), never a hardcoded placeholder.
- RLS: `carts` has no policies — all reads/writes go through the service-role client.
- Local demo mode (no Supabase env): capture UI + `CartSync` are inert; `/api/cron/abandoned-carts` returns a graceful 503.
- `lines` is a snapshot only — never trusted for order pricing.

---

### Task 1: Migration `013` + cart-line validation (TDD)

**Files:**
- Create: `supabase/migrations/013_abandoned_carts.sql`
- Create: `features/cart/cart-lines.ts`
- Test: `tests/domain/cart-lines.test.ts`

**Interfaces:**
- Produces: `validateCartLines(value: unknown, max?: number): CartLine[] | null` — returns the typed lines for a non-empty array of well-formed lines (≤ `max`, default 20), else `null`. A well-formed line has a string `id`, a non-empty string `productSlug`, a positive integer `quantity`, a finite non-negative `unitPrice`, and an `addOns` array.

- [ ] **Step 1: Write the failing test**

```ts
// tests/domain/cart-lines.test.ts
import { describe, expect, it } from 'vitest';
import { validateCartLines } from '@/features/cart/cart-lines';
import type { CartLine } from '@/features/cart/types';

const base: CartLine = {
  id: 'l1', productSlug: 'rose-hour', productName: 'Rose Hour', tone: '#bc6d63',
  unitPrice: 12000, quantity: 1, addOns: [], message: '', deliveryDate: '2026-08-20',
};

describe('validateCartLines', () => {
  it('accepts a well-formed line array', () => {
    expect(validateCartLines([base])).toEqual([base]);
  });

  it('accepts lines with add-ons and optional display fields', () => {
    const line: CartLine = { ...base, variantId: 'v1', variantName: 'Classic', imageUrl: null,
      addOns: [{ id: 'note', name: 'Note', price: 500 }] };
    expect(validateCartLines([line])).toEqual([line]);
  });

  it('rejects a non-array', () => {
    expect(validateCartLines('nope')).toBeNull();
  });

  it('rejects an empty array', () => {
    expect(validateCartLines([])).toBeNull();
  });

  it('rejects a line missing a product slug', () => {
    expect(validateCartLines([{ ...base, productSlug: '' }])).toBeNull();
  });

  it('rejects a non-positive or non-integer quantity', () => {
    expect(validateCartLines([{ ...base, quantity: 0 }])).toBeNull();
    expect(validateCartLines([{ ...base, quantity: 1.5 }])).toBeNull();
  });

  it('rejects a negative or non-numeric unit price', () => {
    expect(validateCartLines([{ ...base, unitPrice: -1 }])).toBeNull();
    expect(validateCartLines([{ ...base, unitPrice: Number.NaN }])).toBeNull();
  });

  it('rejects more lines than the cap', () => {
    const lines = Array.from({ length: 21 }, (_, i) => ({ ...base, id: `l${i}` }));
    expect(validateCartLines(lines, 20)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/domain/cart-lines.test.ts`
Expected: FAIL — `Cannot find module '@/features/cart/cart-lines'`.

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/013_abandoned_carts.sql
-- Abandoned-cart recovery. One active (unconverted) cart per email; the
-- partial unique index frees the email once an order converts the cart.
-- No RLS policies: every read/write goes through the service-role client.
create table if not exists public.carts (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  customer_id uuid references public.profiles(id) on delete cascade,
  locale text not null default 'en' check (locale in ('en', 'ar', 'fr')),
  city text not null default 'cairo',
  lines jsonb not null,
  restore_token text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_emailed_at timestamptz,
  converted_at timestamptz
);

create unique index if not exists carts_email_active_idx
  on public.carts (email) where converted_at is null;
create unique index if not exists carts_restore_token_idx
  on public.carts (restore_token);
create index if not exists carts_abandoned_idx
  on public.carts (updated_at) where converted_at is null and last_emailed_at is null;

alter table public.carts enable row level security;
```

- [ ] **Step 4: Write the validation module**

```ts
// features/cart/cart-lines.ts
import type { CartLine } from './types';

function isCartLine(value: unknown): value is CartLine {
  if (typeof value !== 'object' || value === null) return false;
  const line = value as Record<string, unknown>;
  return (
    typeof line.id === 'string' &&
    typeof line.productSlug === 'string' && line.productSlug.length > 0 &&
    typeof line.quantity === 'number' && Number.isInteger(line.quantity) && line.quantity > 0 &&
    typeof line.unitPrice === 'number' && Number.isFinite(line.unitPrice) && line.unitPrice >= 0 &&
    Array.isArray(line.addOns)
  );
}

export function validateCartLines(value: unknown, max = 20): CartLine[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > max) return null;
  if (!value.every(isCartLine)) return null;
  return value as CartLine[];
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/domain/cart-lines.test.ts`
Expected: PASS (8/8).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/013_abandoned_carts.sql features/cart/cart-lines.ts tests/domain/cart-lines.test.ts
git commit -m "feat: carts table and cart-line validation for abandoned-cart recovery"
```

---

### Task 2: Cart sync service + routes + conversion (TDD)

**Files:**
- Create: `features/cart/cart-sync.ts`
- Create: `app/api/cart/sync/route.ts`
- Create: `app/api/cart/restore/route.ts`
- Modify: `app/api/orders/route.ts` (mark the cart converted after order creation)
- Test: `tests/domain/cart-sync.test.ts`

**Interfaces:**
- Consumes: `validateCartLines` (Task 1), `CartLine` type, `getCurrentCustomer` → `{ id, email } | null`, `getAdminSupabase`, `logRouteError`, `isCronAuthorized` (unused here).
- Produces:
  - `upsertCart(client, { email, customerId?, locale, city, lines }) → { status: 'ok', restoreToken } | { status: 'invalid' } | { status: 'failure' }`
  - `markCartConverted(client, { email }) → { status: 'ok' } | { status: 'failure' }`
  - `getCartByRestoreToken(client, { token }) → { status: 'ok', lines } | { status: 'not_found' } | { status: 'failure' }`
  - `POST /api/cart/sync` → `{ restoreToken }` (200) | 400/429/503
  - `GET /api/cart/restore?token=` → `{ lines }` (200) | 404/503

- [ ] **Step 1: Write the failing test**

```ts
// tests/domain/cart-sync.test.ts
import { describe, expect, it } from 'vitest';
import { getCartByRestoreToken, markCartConverted, upsertCart } from '@/features/cart/cart-sync';
import type { CartLine } from '@/features/cart/types';

const line: CartLine = { id: 'l1', productSlug: 'rose-hour', productName: 'Rose Hour', tone: '#bc6d63', unitPrice: 12000, quantity: 1, addOns: [], message: '', deliveryDate: '2026-08-20' };

function fakeClient(options: { existing?: unknown; insertError?: unknown; updateError?: unknown; deleteError?: unknown; row?: unknown } = {}) {
  const calls: Array<{ table: string; op: string; payload?: unknown }> = [];
  const client = {
    from: (table: string) => ({
      select: () => ({ eq: () => ({ is: () => ({ maybeSingle: async () => ({ data: options.existing ?? null, error: null }) }) }), maybeSingle: async () => ({ data: options.row ?? null, error: null }) }) }),
      insert: (payload: unknown) => { calls.push({ table, op: 'insert', payload }); return { error: options.insertError ?? null }; },
      update: (payload: unknown) => { calls.push({ table, op: 'update', payload }); return { eq: () => ({ is: () => ({ error: options.updateError ?? null }), error: options.updateError ?? null }) }; },
      delete: () => { calls.push({ table, op: 'delete' }); return { eq: () => ({ is: () => ({ error: options.deleteError ?? null }) }) }; },
    }),
  };
  return { client, calls };
}

describe('upsertCart', () => {
  it('inserts a new cart with a fresh restore token', async () => {
    const { client, calls } = fakeClient();
    const result = await upsertCart(client, { email: 'a@b.com', locale: 'fr', city: 'cairo', lines: [line] });
    expect(result.status).toBe('ok');
    const insert = calls.find((c) => c.table === 'carts' && c.op === 'insert')?.payload as Record<string, unknown>;
    expect(insert.email).toBe('a@b.com');
    expect(insert.locale).toBe('fr');
    expect(insert.lines).toEqual([line]);
    expect(typeof insert.restore_token).toBe('string');
  });

  it('updates the existing active cart and refreshes the token', async () => {
    const { client, calls } = fakeClient({ existing: { id: 'c1' } });
    const result = await upsertCart(client, { email: 'a@b.com', locale: 'en', city: 'cairo', lines: [line] });
    expect(result.status).toBe('ok');
    const update = calls.find((c) => c.table === 'carts' && c.op === 'update')?.payload as Record<string, unknown>;
    expect(update.lines).toEqual([line]);
    expect(typeof update.restore_token).toBe('string');
  });

  it('deletes the active cart when the bag is emptied', async () => {
    const { client, calls } = fakeClient();
    const result = await upsertCart(client, { email: 'a@b.com', locale: 'en', city: 'cairo', lines: [] });
    expect(result.status).toBe('ok');
    expect(calls.some((c) => c.table === 'carts' && c.op === 'delete')).toBe(true);
  });

  it('rejects an invalid email', async () => {
    const { client } = fakeClient();
    expect(await upsertCart(client, { email: 'not-an-email', locale: 'en', city: 'cairo', lines: [line] })).toEqual({ status: 'invalid' });
  });

  it('rejects malformed lines', async () => {
    const { client } = fakeClient();
    expect(await upsertCart(client, { email: 'a@b.com', locale: 'en', city: 'cairo', lines: [{ id: 1 } as never] })).toEqual({ status: 'invalid' });
  });

  it('returns failure on an insert error', async () => {
    const { client } = fakeClient({ insertError: new Error('db down') });
    expect(await upsertCart(client, { email: 'a@b.com', locale: 'en', city: 'cairo', lines: [line] })).toEqual({ status: 'failure' });
  });
});

describe('markCartConverted', () => {
  it('stamps converted_at on the active cart', async () => {
    const { client, calls } = fakeClient();
    expect(await markCartConverted(client, { email: 'a@b.com' })).toEqual({ status: 'ok' });
    const update = calls.find((c) => c.table === 'carts' && c.op === 'update')?.payload as Record<string, unknown>;
    expect(typeof update.converted_at).toBe('string');
  });

  it('is a no-op for an empty email', async () => {
    const { client, calls } = fakeClient();
    expect(await markCartConverted(client, { email: '  ' })).toEqual({ status: 'ok' });
    expect(calls).toEqual([]);
  });
});

describe('getCartByRestoreToken', () => {
  it('returns the lines for a valid token', async () => {
    const { client } = fakeClient({ row: { lines: [line] } });
    expect(await getCartByRestoreToken(client, { token: 't1' })).toEqual({ status: 'ok', lines: [line] });
  });

  it('returns not_found for an unknown token', async () => {
    const { client } = fakeClient();
    expect(await getCartByRestoreToken(client, { token: 'missing' })).toEqual({ status: 'not_found' });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/domain/cart-sync.test.ts`
Expected: FAIL — `Cannot find module '@/features/cart/cart-sync'`.

- [ ] **Step 3: Write the service**

```ts
// features/cart/cart-sync.ts
import { randomUUID } from 'node:crypto';
import { validateCartLines } from './cart-lines';
import type { CartLine } from './types';

type CartClient = { from: (table: string) => any };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type UpsertCartResult = { status: 'ok'; restoreToken: string } | { status: 'invalid' } | { status: 'failure' };

export async function upsertCart(
  client: CartClient,
  input: { email: string; customerId?: string | null; locale: 'en' | 'ar' | 'fr'; city: string; lines: CartLine[] },
): Promise<UpsertCartResult> {
  const email = input.email.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return { status: 'invalid' };
  try {
    if (Array.isArray(input.lines) && input.lines.length === 0) {
      const { error } = await client.from('carts').delete().eq('email', email).is('converted_at', null);
      return error ? { status: 'failure' } : { status: 'ok', restoreToken: '' };
    }
    const lines = validateCartLines(input.lines);
    if (!lines) return { status: 'invalid' };
    const restoreToken = randomUUID();
    const row = { email, customer_id: input.customerId ?? null, locale: input.locale, city: input.city, lines, restore_token: restoreToken, updated_at: new Date().toISOString() };
    const { data: existing } = await client.from('carts').select('id').eq('email', email).is('converted_at', null).maybeSingle();
    if (existing) {
      const { error } = await client.from('carts').update(row).eq('id', (existing as { id: string }).id);
      if (error) return { status: 'failure' };
    } else {
      const { error } = await client.from('carts').insert(row);
      if (error) return { status: 'failure' };
    }
    return { status: 'ok', restoreToken };
  } catch {
    return { status: 'failure' };
  }
}

export type MarkConvertedResult = { status: 'ok' } | { status: 'failure' };

export async function markCartConverted(client: CartClient, input: { email: string }): Promise<MarkConvertedResult> {
  const email = input.email.trim().toLowerCase();
  if (!email) return { status: 'ok' };
  try {
    const { error } = await client.from('carts').update({ converted_at: new Date().toISOString() }).eq('email', email).is('converted_at', null);
    return error ? { status: 'failure' } : { status: 'ok' };
  } catch {
    return { status: 'failure' };
  }
}

export type RestoreCartResult = { status: 'ok'; lines: CartLine[] } | { status: 'not_found' } | { status: 'failure' };

export async function getCartByRestoreToken(client: CartClient, input: { token: string }): Promise<RestoreCartResult> {
  if (!input.token) return { status: 'not_found' };
  try {
    const { data } = await client.from('carts').select('lines').eq('restore_token', input.token).maybeSingle();
    if (!data) return { status: 'not_found' };
    const lines = validateCartLines((data as { lines: unknown }).lines);
    if (!lines) return { status: 'not_found' };
    return { status: 'ok', lines };
  } catch {
    return { status: 'failure' };
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/domain/cart-sync.test.ts`
Expected: PASS (10/10).

- [ ] **Step 5: Write the sync route**

```ts
// app/api/cart/sync/route.ts
import { NextResponse } from 'next/server';
import { upsertCart } from '@/features/cart/cart-sync';
import { getCurrentCustomer } from '@/features/auth/customer';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { logRouteError } from '@/lib/api';

const recent = new Map<string, number>();

export async function POST(request: Request) {
  try {
    const customer = await getCurrentCustomer();
    const body = (await request.json().catch(() => null)) as { email?: unknown; locale?: unknown; city?: unknown; lines?: unknown } | null;
    if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
    const email = (customer?.email ?? (typeof body.email === 'string' ? body.email : '')).trim().toLowerCase();
    const locale = body.locale === 'ar' || body.locale === 'fr' ? body.locale : 'en';
    const city = typeof body.city === 'string' && body.city.length > 0 ? body.city.slice(0, 40) : 'cairo';
    if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 });
    const now = Date.now();
    if (now - (recent.get(email) ?? 0) < 12_000) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    recent.set(email, now);
    const result = await upsertCart(getAdminSupabase(), { email, customerId: customer?.id ?? null, locale, city, lines: (body.lines as never) ?? [] });
    if (result.status === 'invalid') return NextResponse.json({ error: 'Invalid cart' }, { status: 400 });
    if (result.status === 'failure') return NextResponse.json({ error: 'Could not save the cart' }, { status: 500 });
    return NextResponse.json({ restoreToken: result.restoreToken }, { status: 200 });
  } catch (error) {
    logRouteError('cart sync', error);
    return NextResponse.json({ error: 'Cart save is temporarily unavailable.' }, { status: 503 });
  }
}
```

- [ ] **Step 6: Write the restore route**

```ts
// app/api/cart/restore/route.ts
import { NextResponse } from 'next/server';
import { getCartByRestoreToken } from '@/features/cart/cart-sync';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { logRouteError } from '@/lib/api';

export async function GET(request: Request) {
  try {
    const token = new URL(request.url).searchParams.get('token') ?? '';
    const result = await getCartByRestoreToken(getAdminSupabase(), { token });
    if (result.status === 'not_found') return NextResponse.json({ error: 'Cart not found' }, { status: 404 });
    if (result.status === 'failure') return NextResponse.json({ error: 'Could not restore the cart' }, { status: 500 });
    return NextResponse.json({ lines: result.lines }, { status: 200 });
  } catch (error) {
    logRouteError('cart restore', error);
    return NextResponse.json({ error: 'Cart restore is temporarily unavailable.' }, { status: 503 });
  }
}
```

- [ ] **Step 7: Mark the cart converted in the orders route**

In `app/api/orders/route.ts`, add the import and the best-effort call immediately after the existing `deliverOrderNotification(...)` invocation (which already receives `checkout`):

```ts
import { markCartConverted } from '@/features/cart/cart-sync';
```

```ts
    await deliverOrderNotification(getAdminSupabase(), {
      // ... existing call unchanged ...
    });
    // Best-effort: an order must never fail because a cart could not be marked.
    await markCartConverted(getAdminSupabase(), { email: checkout.senderEmail });
```

The conversion runs inside the route's existing try/catch and `markCartConverted` swallows its own errors, so a cart-mark failure never affects the order response.

- [ ] **Step 8: Lint and run the full domain tests**

Run: `npm run lint` then `npx vitest run tests/domain/cart-sync.test.ts tests/domain/cart-lines.test.ts`
Expected: lint clean, both test files PASS.

- [ ] **Step 9: Commit**

```bash
git add features/cart/cart-sync.ts app/api/cart/sync/route.ts app/api/cart/restore/route.ts app/api/orders/route.ts tests/domain/cart-sync.test.ts
git commit -m "feat: cart sync/restore service and routes with order conversion"
```

---

### Task 3: `CartSync` + `SaveBagField` + i18n (TDD)

**Files:**
- Create: `features/cart/CartSync.tsx`
- Create: `features/cart/SaveBagField.tsx`
- Modify: `app/layout.tsx` (mount `CartSync` inside `CartProvider`)
- Modify: `features/cart/CartPageContent.tsx` (render `SaveBagField` in the summary aside)
- Modify: `features/i18n/dictionaries.ts` (8 keys × 3 locales)
- Test: `tests/components/CartSync.test.tsx`, `tests/components/SaveBagField.test.tsx`

**Interfaces:**
- Consumes: `useCart` (`cart`, `ready`), `useI18n` (`t`, `locale`), `useStorePath` (`city`), `getBrowserSupabase`, `useStorePath`/`useParams`.
- Produces: `CartSync` (renders `null`), `SaveBagField` (guest email capture control).

- [ ] **Step 1: Add the i18n keys**

In `features/i18n/dictionaries.ts`, append after the existing `wishlistEmptyHint` key in each locale object (the last key before the closing `}`).

EN (after `wishlistEmptyHint: 'Save flowers you like with the heart on any product.',`):

```ts
    emailMeMyBag: 'Email me my bag', emailLabel: 'Email', saveBagHint: 'Save your bag so you can finish later.', bagSaved: "Saved — we'll hold this for you.", saveBagInvalid: 'Enter a valid email.', restorePrompt: 'Restore your saved bag?', restoreNow: 'Restore', restoreDiscard: 'Keep current bag',
```

AR (after `wishlistEmptyHint: 'احفظ الزهور التي تعجبك بالضغط على القلب في أي منتج.',`):

```ts
    emailMeMyBag: 'أرسل حقيبتي إلى بريدي', emailLabel: 'البريد الإلكتروني', saveBagHint: 'احفظ حقيبتك لتكمل طلبك لاحقاً.', bagSaved: 'تم الحفظ — سنحتفظ بها لك.', saveBagInvalid: 'أدخل بريداً إلكترونياً صالحاً.', restorePrompt: 'استعادة حقيبتك المحفوظة؟', restoreNow: 'استعادة', restoreDiscard: 'الإبقاء على الحقيبة الحالية',
```

FR (after `wishlistEmptyHint: 'Enregistrez des fleurs avec le cœur sur n’importe quel produit.',`):

```ts
    emailMeMyBag: 'Envoyez-moi mon panier', emailLabel: 'E-mail', saveBagHint: 'Enregistrez votre panier pour le terminer plus tard.', bagSaved: 'Enregistré — nous le gardons pour vous.', saveBagInvalid: 'Saisissez un e-mail valide.', restorePrompt: 'Restaurer votre panier enregistré ?', restoreNow: 'Restaurer', restoreDiscard: 'Garder le panier actuel',
```

- [ ] **Step 2: Write the failing component tests**

```tsx
// tests/components/CartSync.test.tsx
import { waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { CartSync } from '@/features/cart/CartSync';
import { CartProvider } from '@/features/cart/CartProvider';
import { I18nProvider } from '@/features/i18n/I18nProvider';

const auth = vi.hoisted(() => {
  const state = {
    callback: null as ((event: string) => void) | null,
    supabase: {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
        onAuthStateChange: vi.fn((callback: (event: string) => void) => {
          state.callback = callback;
          return { data: { subscription: { unsubscribe: vi.fn() } } };
        }),
      },
    },
  };
  return state;
});

vi.mock('@/lib/supabase/browser', () => ({ getBrowserSupabase: () => auth.supabase }));
vi.mock('next/navigation', () => ({ useParams: () => ({ locale: 'en', city: 'cairo' }) }));

describe('CartSync', () => {
  it('syncs the cart when a signed-in user signs in', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    auth.supabase.auth.getUser.mockResolvedValue({ data: { user: { email: 'a@b.com' } }, error: null });

    render(<I18nProvider><CartProvider><CartSync /></CartProvider></I18nProvider>);
    auth.callback?.('SIGNED_IN');

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/cart/sync', expect.objectContaining({ method: 'POST' })));
    vi.unstubAllGlobals();
  });

  it('does not sync for a signed-out user', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    auth.supabase.auth.getUser.mockResolvedValue({ data: { user: null }, error: null });

    render(<I18nProvider><CartProvider><CartSync /></CartProvider></I18nProvider>);
    auth.callback?.('SIGNED_IN');

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
```

```tsx
// tests/components/SaveBagField.test.tsx
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SaveBagField } from '@/features/cart/SaveBagField';
import { I18nProvider } from '@/features/i18n/I18nProvider';
import { CartProvider } from '@/features/cart/CartProvider';

vi.mock('@/lib/supabase/browser', () => ({ getBrowserSupabase: vi.fn() }));
vi.mock('next/navigation', () => ({ useParams: () => ({ locale: 'en', city: 'cairo' }) }));

import { getBrowserSupabase } from '@/lib/supabase/browser';

const fetchMock = vi.fn();

beforeEach(() => { vi.stubGlobal('fetch', fetchMock); fetchMock.mockClear(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('SaveBagField', () => {
  it('renders nothing when Supabase is not configured', () => {
    vi.mocked(getBrowserSupabase).mockReturnValue(null);
    render(<I18nProvider><CartProvider><SaveBagField /></CartProvider></I18nProvider>);
    expect(screen.queryByText('Save your bag so you can finish later.')).toBeNull();
  });

  it('rejects an invalid email', async () => {
    vi.mocked(getBrowserSupabase).mockReturnValue({ auth: {} } as never);
    render(<I18nProvider><CartProvider><SaveBagField /></CartProvider></I18nProvider>);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'nope' } });
    fireEvent.click(screen.getByRole('button', { name: 'Email me my bag' }));
    expect(await screen.findByText('Enter a valid email.')).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts the cart and shows the saved confirmation', async () => {
    vi.mocked(getBrowserSupabase).mockReturnValue({ auth: {} } as never);
    fetchMock.mockResolvedValue({ ok: true });
    render(<I18nProvider><CartProvider><SaveBagField /></CartProvider></I18nProvider>);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Email me my bag' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/cart/sync', expect.objectContaining({ method: 'POST' })));
    expect(await screen.findByText("Saved — we'll hold this for you.")).toBeTruthy();
  });

  it('shows an error when the sync fails', async () => {
    vi.mocked(getBrowserSupabase).mockReturnValue({ auth: {} } as never);
    fetchMock.mockResolvedValue({ ok: false });
    render(<I18nProvider><CartProvider><SaveBagField /></CartProvider></I18nProvider>);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Email me my bag' }));
    expect(await screen.findByText('A temporary error occurred. Please try again.')).toBeTruthy();
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run tests/components/CartSync.test.tsx tests/components/SaveBagField.test.tsx`
Expected: FAIL — `Cannot find module '@/features/cart/CartSync'` / `SaveBagField`.

- [ ] **Step 4: Write `CartSync`**

```tsx
// features/cart/CartSync.tsx
'use client';

import { useEffect, useRef } from 'react';
import { getBrowserSupabase } from '@/lib/supabase/browser';
import { useCart } from './CartProvider';
import { useI18n } from '@/features/i18n/I18nProvider';
import { useStorePath } from '@/features/i18n/use-store-path';

export function CartSync() {
  const { cart, ready } = useCart();
  const { locale } = useI18n();
  const { city } = useStorePath();
  const lastSynced = useRef<string | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = getBrowserSupabase();
    if (!supabase || !ready) return;

    const push = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) return;
      const key = JSON.stringify(cart.lines);
      if (lastSynced.current === key) return;
      lastSynced.current = key;
      await fetch('/api/cart/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email, locale, city, lines: cart.lines }),
      });
    };

    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => { void push(); }, 600);

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') void push();
    });

    return () => { if (debounce.current) clearTimeout(debounce.current); subscription.unsubscribe(); };
  }, [cart, ready, locale, city]);

  return null;
}
```

- [ ] **Step 5: Write `SaveBagField`**

```tsx
// features/cart/SaveBagField.tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getBrowserSupabase } from '@/lib/supabase/browser';
import { useCart } from './CartProvider';
import { useI18n } from '@/features/i18n/I18nProvider';
import { useStorePath } from '@/features/i18n/use-store-path';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function SaveBagField() {
  const { t, locale } = useI18n();
  const { city } = useStorePath();
  const { cart } = useCart();
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'invalid' | 'error'>('idle');

  async function save() {
    const trimmed = email.trim();
    if (!EMAIL_RE.test(trimmed)) { setState('invalid'); return; }
    setState('saving');
    try {
      const response = await fetch('/api/cart/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed, locale, city, lines: cart.lines }),
      });
      setState(response.ok ? 'saved' : 'error');
    } catch {
      setState('error');
    }
  }

  if (!getBrowserSupabase()) return null;
  if (state === 'saved') return <p className="text-sm text-success">{t('bagSaved')}</p>;
  return (
    <div className="grid gap-2">
      <p className="text-sm text-muted-foreground">{t('saveBagHint')}</p>
      <div className="flex gap-2">
        <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} aria-label={t('emailLabel')} placeholder={t('emailLabel')} />
        <Button type="button" variant="outline" size="sm" onClick={save} disabled={state === 'saving'}>{t('emailMeMyBag')}</Button>
      </div>
      {state === 'invalid' ? <small className="text-sm text-destructive">{t('saveBagInvalid')}</small> : state === 'error' ? <small className="text-sm text-destructive">{t('temporaryError')}</small> : null}
    </div>
  );
}
```

- [ ] **Step 6: Wire into the layout and cart page**

In `app/layout.tsx`, mount `CartSync` inside `CartProvider` (a sibling of `WishlistProvider`), and add the import:

```tsx
import { CartSync } from '@/features/cart/CartSync';
```

```tsx
<CartProvider><CartSync /><WishlistProvider>{children}</WishlistProvider></CartProvider>
```

In `features/cart/CartPageContent.tsx`, render `SaveBagField` inside the sticky `<aside>` after `<CartSummary>` and before the checkout button; add the import:

```tsx
import { SaveBagField } from './SaveBagField';
```

```tsx
<CartSummary totals={totals} />
<SaveBagField />
<Button asChild><Link href={href('/checkout')}>{t('checkout')} ↗</Link></Button>
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run tests/components/CartSync.test.tsx tests/components/SaveBagField.test.tsx`
Expected: PASS (6/6). Then `npm run lint` — clean. The dictionary-parity is implicitly checked by `tsc` (the `Record<Locale, …>` types require all three locales to define the same keys).

- [ ] **Step 8: Commit**

```bash
git add features/cart/CartSync.tsx features/cart/SaveBagField.tsx app/layout.tsx features/cart/CartPageContent.tsx features/i18n/dictionaries.ts tests/components/CartSync.test.tsx tests/components/SaveBagField.test.tsx
git commit -m "feat: signed-in cart sync and guest save-my-bag email capture"
```

---

### Task 4: Abandoned-cart cron + recovery email (TDD)

**Files:**
- Create: `features/cart/abandoned-email.ts`
- Create: `features/cart/abandoned-cron.ts`
- Create: `app/api/cron/abandoned-carts/route.ts`
- Test: `tests/domain/abandoned-email.test.ts`, `tests/domain/abandoned-cron.test.ts`

**Interfaces:**
- Consumes: `escapeHtml` (exported from `features/notifications/email-templates`), `createGmailTransport`/`MailTransport`, `pickLocalized`, `isCronAuthorized`, `getPublicOrigin`, `getRequiredServerEnv('CRON_SECRET')`, `CartLine`.
- Produces:
  - `renderAbandonedCartEmail({ locale, items, restoreUrl }) → { subject, text, html }`
  - `sendAbandonedCartEmail(input, injectedTransport?)` → `Promise<void>`
  - `runAbandonedCartCron(client, { origin, send?, now? }) → { checked, sent, failed }`
  - `POST/GET /api/cron/abandoned-carts` → `{ ok, summary }` | 401/503

- [ ] **Step 1: Write the failing email test**

```ts
// tests/domain/abandoned-email.test.ts
import { describe, expect, it } from 'vitest';
import { renderAbandonedCartEmail } from '@/features/cart/abandoned-email';
import type { CartLine } from '@/features/cart/types';

const line: CartLine = { id: 'l1', productSlug: 'rose-hour', productName: 'Rose Hour', productNameAr: 'ساعة الورد', productNameFr: 'L’Heure des Roses', tone: '#bc6d63', unitPrice: 12000, quantity: 2, addOns: [], message: '', deliveryDate: '2026-08-20' };

describe('renderAbandonedCartEmail', () => {
  it('renders an English email with item, subtotal, and restore link', () => {
    const email = renderAbandonedCartEmail({ locale: 'en', items: [line], restoreUrl: 'https://x/en/cairo/cart?restore=t1' });
    expect(email.subject).toBe('Your Rosette bag is waiting');
    expect(email.text).toContain('Rose Hour × 2');
    expect(email.text).toContain('https://x/en/cairo/cart?restore=t1');
    expect(email.html).toContain('https://x/en/cairo/cart?restore=t1');
  });

  it('renders Arabic right-to-left', () => {
    const email = renderAbandonedCartEmail({ locale: 'ar', items: [line], restoreUrl: 'https://x/ar/cairo/cart?restore=t1' });
    expect(email.subject).toContain('حقيبتك');
    expect(email.html).toContain('dir="rtl"');
    expect(email.text).toContain('ساعة الورد');
  });

  it('renders French', () => {
    const email = renderAbandonedCartEmail({ locale: 'fr', items: [line], restoreUrl: 'https://x/fr/cairo/cart?restore=t1' });
    expect(email.subject).toBe('Votre panier Rosette vous attend');
    expect(email.text).toContain('L’Heure des Roses');
  });

  it('escapes HTML in item names', () => {
    const evil: CartLine = { ...line, productName: '<script>alert(1)</script>' };
    const email = renderAbandonedCartEmail({ locale: 'en', items: [evil], restoreUrl: 'https://x' });
    expect(email.html).not.toContain('<script>alert');
    expect(email.html).toContain('&lt;script&gt;');
  });
});
```

- [ ] **Step 2: Write the failing cron test**

```ts
// tests/domain/abandoned-cron.test.ts
import { describe, expect, it, vi } from 'vitest';
import { runAbandonedCartCron } from '@/features/cart/abandoned-cron';
import type { CartLine } from '@/features/cart/types';

const line: CartLine = { id: 'l1', productSlug: 'rose-hour', productName: 'Rose Hour', tone: '#bc6d63', unitPrice: 12000, quantity: 1, addOns: [], message: '', deliveryDate: '2026-08-20' };
const now = new Date('2026-08-19T12:00:00Z');

function row(overrides: Record<string, unknown> = {}) {
  return { id: 'c1', email: 'a@b.com', locale: 'en', city: 'cairo', lines: [line], restore_token: 't1', ...overrides };
}

function fakeClient(rows: unknown[]) {
  const calls: Array<{ table: string; op: string; payload?: unknown }> = [];
  const client = {
    from: (table: string) => ({
      select: () => ({ is: () => ({ is: () => ({ lt: () => ({ data: rows, error: null }) }) }) }),
      update: (payload: unknown) => { calls.push({ table, op: 'update', payload }); return { eq: () => ({ error: null }) }; },
    }),
  };
  return { client, calls };
}

describe('runAbandonedCartCron', () => {
  it('emails stale, unconverted, un-emailed carts and stamps last_emailed_at', async () => {
    const send = vi.fn(async () => {});
    const { client, calls } = fakeClient([row()]);
    const summary = await runAbandonedCartCron(client, { origin: 'https://x', send, now });
    expect(summary).toEqual({ checked: 1, sent: 1, failed: 0 });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toMatchObject({ to: 'a@b.com', locale: 'en', restoreUrl: 'https://x/en/cairo/cart?restore=t1' });
    const update = calls.find((c) => c.table === 'carts' && c.op === 'update');
    expect(update?.payload).toEqual({ last_emailed_at: now.toISOString() });
  });

  it('counts a failed send and does not stamp last_emailed_at', async () => {
    const send = vi.fn(async () => { throw new Error('smtp down'); });
    const { client, calls } = fakeClient([row()]);
    const summary = await runAbandonedCartCron(client, { origin: 'https://x', send, now });
    expect(summary).toEqual({ checked: 1, sent: 0, failed: 1 });
    expect(calls.filter((c) => c.op === 'update')).toEqual([]);
  });

  it('skips rows with empty lines', async () => {
    const send = vi.fn(async () => {});
    const { client } = fakeClient([row({ lines: [] })]);
    const summary = await runAbandonedCartCron(client, { origin: 'https://x', send, now });
    expect(summary).toEqual({ checked: 1, sent: 0, failed: 0 });
    expect(send).not.toHaveBeenCalled();
  });

  it('defaults the locale to en and the city to cairo for missing fields', async () => {
    const send = vi.fn(async () => {});
    const { client } = fakeClient([row({ locale: 'xx', city: '' })]);
    await runAbandonedCartCron(client, { origin: 'https://x', send, now });
    expect(send.mock.calls[0][0]).toMatchObject({ locale: 'en', restoreUrl: 'https://x/en/cairo/cart?restore=t1' });
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run tests/domain/abandoned-email.test.ts tests/domain/abandoned-cron.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 4: Write the email module**

```ts
// features/cart/abandoned-email.ts
import { escapeHtml } from '@/features/notifications/email-templates';
import { createGmailTransport, type MailTransport } from '@/features/notifications/gmail-mailer';
import { getOptionalServerEnv, getRequiredServerEnv } from '@/lib/server-env';
import { pickLocalized } from '@/features/i18n/pick';
import type { CartLine } from './types';

type EmailLocale = 'en' | 'ar' | 'fr';

const intlLocales = { en: 'en-EG', ar: 'ar-EG', fr: 'fr-FR' } as const;

const copy: Record<EmailLocale, { subject: string; title: string; subtotal: string; delivery: string; finish: string }> = {
  en: { subject: 'Your Rosette bag is waiting', title: 'Your bag is waiting', subtotal: 'Subtotal', delivery: 'Delivery is calculated at checkout', finish: 'Finish your order' },
  ar: { subject: 'حقيبتك من روزيت بانتظارك', title: 'حقيبتك بانتظارك', subtotal: 'المجموع الفرعي', delivery: 'يُحتسب التوصيل عند الدفع', finish: 'أكمل طلبك' },
  fr: { subject: 'Votre panier Rosette vous attend', title: 'Votre panier vous attend', subtotal: 'Sous-total', delivery: 'La livraison est calculée au paiement', finish: 'Terminer votre commande' },
};

function money(locale: EmailLocale, minor: number) {
  return new Intl.NumberFormat(intlLocales[locale], { style: 'currency', currency: 'EGP', maximumFractionDigits: 0 }).format(minor / 100);
}

export function renderAbandonedCartEmail(input: { locale: EmailLocale; items: CartLine[]; restoreUrl: string }) {
  const { locale } = input;
  const isArabic = locale === 'ar';
  const c = copy[locale];
  const url = escapeHtml(input.restoreUrl);
  const rows = input.items.map((line) => ({
    name: escapeHtml(pickLocalized(locale, { en: line.productName, ar: line.productNameAr, fr: line.productNameFr }) || line.productSlug),
    quantity: line.quantity,
    total: line.unitPrice * line.quantity,
  }));
  const subtotal = rows.reduce((sum, row) => sum + row.total, 0);
  const text = `${c.title}\n${rows.map((row) => `${row.name} × ${row.quantity} — ${money(locale, row.total)}`).join('\n')}\n${c.subtotal}: ${money(locale, subtotal)}\n${c.delivery}\n${input.restoreUrl}`;
  const htmlRows = rows.map((row) => `<li>${row.name} × ${row.quantity} — ${money(locale, row.total)}</li>`).join('');
  const html = `<!doctype html><html lang="${locale}" dir="${isArabic ? 'rtl' : 'ltr'}"><body style="font-family:Arial,sans-serif;text-align:${isArabic ? 'right' : 'left'}"><h1>${c.title}</h1><ul>${htmlRows}</ul><p>${c.subtotal}: ${money(locale, subtotal)}</p><p>${c.delivery}</p><p><a href="${url}">${c.finish}</a></p></body></html>`;
  return { subject: c.subject, text, html };
}

export async function sendAbandonedCartEmail(
  input: { to: string; locale: EmailLocale; items: CartLine[]; restoreUrl: string },
  injectedTransport?: MailTransport,
): Promise<void> {
  const { subject, text, html } = renderAbandonedCartEmail(input);
  const transport = injectedTransport ?? createGmailTransport();
  const from = injectedTransport ? (getOptionalServerEnv('GMAIL_FROM') ?? 'Rosette <no-reply@rosette.example>') : getRequiredServerEnv('GMAIL_FROM');
  await transport.sendMail({ from, to: input.to, subject, text, html });
}
```

- [ ] **Step 5: Write the cron module**

```ts
// features/cart/abandoned-cron.ts
import { sendAbandonedCartEmail } from './abandoned-email';
import type { CartLine } from './types';

type CronClient = { from: (table: string) => any };

export type AbandonedCartSummary = { checked: number; sent: number; failed: number };

export async function runAbandonedCartCron(
  client: CronClient,
  deps: { origin: string; send?: typeof sendAbandonedCartEmail; now?: Date },
): Promise<AbandonedCartSummary> {
  const send = deps.send ?? sendAbandonedCartEmail;
  const now = deps.now ?? new Date();
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const { data } = await client.from('carts')
    .select('id,email,locale,city,lines,restore_token')
    .is('converted_at', null)
    .is('last_emailed_at', null)
    .lt('updated_at', cutoff);
  const rows = (data ?? []) as Array<Record<string, any>>;
  const summary: AbandonedCartSummary = { checked: 0, sent: 0, failed: 0 };
  for (const row of rows) {
    summary.checked += 1;
    const lines = Array.isArray(row.lines) ? (row.lines as CartLine[]) : [];
    if (!lines.length) continue;
    const locale = row.locale === 'ar' || row.locale === 'fr' ? row.locale : 'en';
    const city = typeof row.city === 'string' && row.city.length > 0 ? row.city : 'cairo';
    const restoreUrl = `${deps.origin.replace(/\/$/, '')}/${locale}/${city}/cart?restore=${encodeURIComponent(String(row.restore_token))}`;
    try {
      await send({ to: String(row.email), locale, items: lines, restoreUrl });
      await client.from('carts').update({ last_emailed_at: now.toISOString() }).eq('id', String(row.id));
      summary.sent += 1;
    } catch {
      summary.failed += 1;
    }
  }
  return summary;
}
```

- [ ] **Step 6: Write the cron route**

```ts
// app/api/cron/abandoned-carts/route.ts
import { NextResponse } from 'next/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getRequiredServerEnv } from '@/lib/server-env';
import { getPublicOrigin } from '@/lib/origin';
import { logRouteError } from '@/lib/api';
import { isCronAuthorized } from '@/lib/cron';
import { runAbandonedCartCron } from '@/features/cart/abandoned-cron';

async function handle(request: Request) {
  try {
    if (!isCronAuthorized(request.headers.get('authorization'), getRequiredServerEnv('CRON_SECRET'))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const summary = await runAbandonedCartCron(getAdminSupabase(), { origin: getPublicOrigin(request) });
    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    logRouteError('abandoned-cart recovery', error);
    return NextResponse.json({ error: 'Abandoned-cart job failed' }, { status: 503 });
  }
}

export async function GET(request: Request) { return handle(request); }
export async function POST(request: Request) { return handle(request); }
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run tests/domain/abandoned-email.test.ts tests/domain/abandoned-cron.test.ts`
Expected: PASS (8/8). Then `npm run lint` — clean.

- [ ] **Step 8: Commit**

```bash
git add features/cart/abandoned-email.ts features/cart/abandoned-cron.ts app/api/cron/abandoned-carts/route.ts tests/domain/abandoned-email.test.ts tests/domain/abandoned-cron.test.ts
git commit -m "feat: abandoned-cart recovery cron and email"
```

---

### Task 5: Cross-device restore on the cart page (TDD)

**Files:**
- Modify: `features/cart/CartProvider.tsx` (add a `restoreCart` method)
- Create: `features/cart/RestoreCart.tsx`
- Modify: `features/cart/CartPageContent.tsx` (render `RestoreCart`)
- Test: `tests/components/RestoreCart.test.tsx`

**Interfaces:**
- Consumes: `useCart` (`cart`, `ready`, `restoreCart`), `useSearchParams`/`useRouter` (from `next/navigation`), `getBrowserSupabase`, i18n keys `restorePrompt`/`restoreNow`/`restoreDiscard`.
- Produces: `restoreCart(lines: CartLine[]): void` on the cart context; `RestoreCart` (renders a restore prompt or nothing).

- [ ] **Step 1: Add `restoreCart` to `CartProvider`**

In `features/cart/CartProvider.tsx`, extend the context type and value:

```ts
type CartContextValue = { cart: Cart; ready: boolean; itemCount: number; totals: ReturnType<typeof calculateCartTotals>; addItem: (input: AddCartLineInput) => void; updateQuantity: (lineId: string, quantity: number) => void; removeItem: (lineId: string) => void; clearCart: () => void; restoreCart: (lines: CartLine[]) => void };
```

Add the method to the value object (import `CartLine` from `./types`):

```ts
restoreCart: (lines) => setCart({ lines }),
```

- [ ] **Step 2: Write the failing test**

```tsx
// tests/components/RestoreCart.test.tsx
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RestoreCart } from '@/features/cart/RestoreCart';
import { CartProvider, useCart } from '@/features/cart/CartProvider';
import { I18nProvider } from '@/features/i18n/I18nProvider';
import type { CartLine } from '@/features/cart/types';

const restored: CartLine = { id: 'l1', productSlug: 'rose-hour', productName: 'Rose Hour', tone: '#bc6d63', unitPrice: 12000, quantity: 1, addOns: [], message: '', deliveryDate: '2026-08-20' };
const local: CartLine = { ...restored, id: 'l2', productSlug: 'citrus-cloud', productName: 'Citrus Cloud' };

const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useParams: () => ({ locale: 'en', city: 'cairo' }),
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams('restore=t1'),
}));
vi.mock('@/lib/supabase/browser', () => ({ getBrowserSupabase: () => ({ auth: {} }) }));

function CartProbe() {
  const { cart } = useCart();
  return <span data-testid="slug">{cart.lines[0]?.productSlug ?? ''}</span>;
}

const fetchMock = vi.fn();

beforeEach(() => { vi.stubGlobal('fetch', fetchMock); fetchMock.mockClear(); replace.mockClear(); localStorage.clear(); });
afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

describe('RestoreCart', () => {
  it('restores into an empty bag', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ lines: [restored] }) });
    render(<I18nProvider><CartProvider><RestoreCart /><CartProbe /></CartProvider></I18nProvider>);
    await waitFor(() => expect(screen.getByTestId('slug')).toHaveTextContent('rose-hour'));
    expect(fetchMock).toHaveBeenCalledWith('/api/cart/restore?token=t1');
    expect(replace).toHaveBeenCalled();
  });

  it('prompts then restores when the bag already has items', async () => {
    localStorage.setItem('rosette.cart.v1', JSON.stringify({ lines: [local], version: 1 }));
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ lines: [restored] }) });
    render(<I18nProvider><CartProvider><RestoreCart /><CartProbe /></CartProvider></I18nProvider>);
    expect(await screen.findByText('Restore your saved bag?')).toBeTruthy();
    expect(screen.getByTestId('slug')).toHaveTextContent('citrus-cloud');
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    await waitFor(() => expect(screen.getByTestId('slug')).toHaveTextContent('rose-hour'));
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run tests/components/RestoreCart.test.tsx`
Expected: FAIL — `Cannot find module '@/features/cart/RestoreCart'`.

- [ ] **Step 4: Write `RestoreCart`**

```tsx
// features/cart/RestoreCart.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { getBrowserSupabase } from '@/lib/supabase/browser';
import { useCart } from './CartProvider';
import { useI18n } from '@/features/i18n/I18nProvider';
import { useStorePath } from '@/features/i18n/use-store-path';
import type { CartLine } from './types';

export function RestoreCart() {
  const { t } = useI18n();
  const router = useRouter();
  const { href } = useStorePath();
  const params = useSearchParams();
  const token = params.get('restore');
  const { cart, ready, restoreCart } = useCart();
  const [pending, setPending] = useState<CartLine[] | null>(null);

  useEffect(() => {
    if (!token || !ready || !getBrowserSupabase()) return;
    let active = true;
    (async () => {
      router.replace(href('/cart'), { scroll: false });
      const response = await fetch(`/api/cart/restore?token=${encodeURIComponent(token)}`);
      if (!response.ok || !active) return;
      const body = (await response.json()) as { lines?: unknown };
      if (!Array.isArray(body.lines)) return;
      const lines = body.lines as CartLine[];
      if (cart.lines.length === 0) restoreCart(lines);
      else setPending(lines);
    })();
    return () => { active = false; };
  }, [token, ready]);

  if (!pending) return null;
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="font-bold">{t('restorePrompt')}</p>
      <div className="mt-3 flex gap-2">
        <Button size="sm" onClick={() => { restoreCart(pending); setPending(null); }}>{t('restoreNow')}</Button>
        <Button size="sm" variant="outline" onClick={() => setPending(null)}>{t('restoreDiscard')}</Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Wire into the cart page**

In `features/cart/CartPageContent.tsx`, render `RestoreCart` immediately inside the returned container (before the two-column grid), and add the import:

```tsx
import { RestoreCart } from './RestoreCart';
```

```tsx
return <><RestoreCart /><div className="grid grid-cols-[minmax(0,1.4fr)_minmax(260px,0.6fr)] gap-16 pt-8 max-md:grid-cols-1">…</div></>;
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/components/RestoreCart.test.tsx`
Expected: PASS. Then `npm run lint` — clean. Run the full component suite to confirm no regression: `npx vitest run tests/components`.

- [ ] **Step 7: Commit**

```bash
git add features/cart/CartProvider.tsx features/cart/RestoreCart.tsx features/cart/CartPageContent.tsx tests/components/RestoreCart.test.tsx
git commit -m "feat: restore a saved bag from the recovery link"
```

---

### Task 6: Full gate + final review + branch finish

**Files:** none (verification + ledger only).

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all tests pass (previous 493 + 34 new = 527 across ~104 files).

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: clean (tsc --noEmit, exit 0).

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: exit 0 — the new routes `/api/cart/sync`, `/api/cart/restore`, `/api/cron/abandoned-carts` and the cart page all compile. Restore the build artifact afterward: `git checkout -- next-env.d.ts`.

- [ ] **Step 4: Whole-branch review**

Run: `git status --short` and `git log --oneline master..HEAD`
Expected: only the 5 feature commits + their files; no stray changes (the `playwright` devDependency was already committed separately).

- [ ] **Step 5: Record the ledger and report**

Update `.superpowers/sdd/2026-08-19-abandoned-cart/progress.md` with rulings, then report the branch ready for merge (offer to merge + re-verify + push, as with prior features).
