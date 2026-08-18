# Admin "Retry stuck emails" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an admin `/admin/notifications` page with a "Retry stuck emails" button and a read-only list of stuck email deliveries.

**Architecture:** Extract the shared `isStuckRow` predicate from the existing retry function, add a `listStuckDeliveries` admin helper, wrap the retry function in an admin-authenticated endpoint, and render a server page + client button. No change to the cron endpoint or retry policy.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase JS client, Vitest + Testing Library (jsdom), lucide-react, shadcn UI components.

**Spec:** `docs/superpowers/specs/2026-08-18-admin-notifications-retry-design.md`

## Global Constraints

- No live services in tests — fake client + mocked `fetch`.
- The retry function's behavior is unchanged (its existing 8 tests stay green).
- Reuse `MAX_ATTEMPTS = 3` and `STALE_PENDING_MS = 15 * 60 * 1000` from `@/features/notifications/notification-retry`.
- i18n keys must be added to all three locales (`en`, `ar`, `fr`) — `tests/domain/i18n-dictionary.test.ts` enforces ar/fr ⊇ en.
- Admin pages: server component → `getCurrentAdmin()` then `redirect('/login')` if null; client forms use `useI18n().t`, `fetch`, and `router.refresh()`.

---

### Task 1: i18n keys (EN/AR/FR)

**Files:**
- Modify: `features/i18n/dictionaries.ts`

**Interfaces:**
- Produces keys consumed by Tasks 2–4: `notifications`, `notificationOperations`, `stuckEmails`, `retryStuckEmails`, `retrying`, `couldNotRetryEmails`, `retrySummary`, `noStuckEmails`, `emailType`, `attempts`, `lastError`, `statusFailed`, `emailOrderReceived`, `emailPaymentConfirmed`, `emailPaymentFailed`, `createdAt`.

- [ ] **Step 1: Add the keys to `en`**

Insert into the `en` admin block (after the `promos` keys, before the closing `}` of the `en` object):

```ts
    notifications: 'Notifications', notificationOperations: 'Notification operations', stuckEmails: 'Stuck emails', retryStuckEmails: 'Retry stuck emails', retrying: 'Retrying…', couldNotRetryEmails: 'Could not retry emails.', retrySummary: 'Retried {retried} · sent {sent} · failed {failed} · skipped {skipped}', noStuckEmails: 'No stuck emails right now.', emailType: 'Type', attempts: 'Attempts', lastError: 'Last error', statusFailed: 'Failed', emailOrderReceived: 'Order received', emailPaymentConfirmed: 'Payment confirmed', emailPaymentFailed: 'Payment failed', createdAt: 'Created',
```

- [ ] **Step 2: Add the keys to `ar`**

```ts
    notifications: 'الإشعارات', notificationOperations: 'عمليات الإشعارات', stuckEmails: 'الرسائل العالقة', retryStuckEmails: 'إعادة إرسال الرسائل العالقة', retrying: 'جارٍ إعادة الإرسال…', couldNotRetryEmails: 'تعذر إعادة إرسال الرسائل.', retrySummary: 'أُعيد الإرسال {retried} · تم {sent} · فشل {failed} · تم تخطي {skipped}', noStuckEmails: 'لا توجد رسائل عالقة حالياً.', emailType: 'النوع', attempts: 'المحاولات', lastError: 'آخر خطأ', statusFailed: 'فشل', emailOrderReceived: 'تم استلام الطلب', emailPaymentConfirmed: 'تأكيد الدفع', emailPaymentFailed: 'تعذر الدفع', createdAt: 'أُنشئ',
```

- [ ] **Step 3: Add the keys to `fr`**

```ts
    notifications: 'Notifications', notificationOperations: 'Opérations de notification', stuckEmails: 'E-mails bloqués', retryStuckEmails: 'Renvoyer les e-mails bloqués', retrying: 'Renvoi…', couldNotRetryEmails: 'Impossible de renvoyer les e-mails.', retrySummary: 'Renvois {retried} · envoyés {sent} · échoués {failed} · ignorés {skipped}', noStuckEmails: 'Aucun e-mail bloqué pour le moment.', emailType: 'Type', attempts: 'Tentatives', lastError: 'Dernière erreur', statusFailed: 'Échoué', emailOrderReceived: 'Commande reçue', emailPaymentConfirmed: 'Paiement confirmé', emailPaymentFailed: 'Paiement échoué', createdAt: 'Créé',
```

- [ ] **Step 4: Verify**

Run: `npx vitest run tests/domain/i18n-dictionary.test.ts`
Expected: PASS (ar/fr are supersets of en).

- [ ] **Step 5: Commit**

```bash
git add features/i18n/dictionaries.ts
git commit -m "Add admin notification i18n keys (EN/AR/FR)"
```

---

### Task 2: `isStuckRow` extraction + `listStuckDeliveries` (TDD)

**Files:**
- Modify: `features/notifications/notification-retry.ts`
- Create: `features/admin/notification-admin.ts`
- Test: `tests/domain/notification-admin.test.ts`

**Interfaces:**
- Consumes: `MAX_ATTEMPTS`, `STALE_PENDING_MS` (already in `notification-retry.ts`).
- Produces: `isStuckRow(row: { status: string; attempts: number; created_at: string }, now: Date): boolean`; `listStuckDeliveries(client, deps?) => Promise<StuckDelivery[]>` where `StuckDelivery = { id; type; recipient; locale; status: 'pending' | 'failed'; attempts; lastError; createdAt; orderNumber }`.

- [ ] **Step 1: Write the failing test**

Create `tests/domain/notification-admin.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { isStuckRow } from '@/features/notifications/notification-retry';
import { listStuckDeliveries } from '@/features/admin/notification-admin';

type DeliveryRow = { id: string; order_id: string; type: string; recipient: string; locale: string; status: string; attempts: number; last_error: string | null; created_at: string };
type OrderRow = { id: string; display_number: string };

function fakeClient(rows: DeliveryRow[], orders: OrderRow[]) {
  const from = (table: string) => {
    if (table === 'notification_deliveries') {
      return { select: () => ({ in: () => ({ data: rows, error: null }) }) };
    }
    return { select: () => ({ in: () => ({ data: orders, error: null }) }) };
  };
  return { from };
}

const now = () => new Date('2026-08-18T12:00:00.000Z');
const row = (over: Partial<DeliveryRow> = {}): DeliveryRow => ({
  id: 'd1', order_id: 'o1', type: 'delivered', recipient: 'buyer@example.com', locale: 'en', status: 'failed', attempts: 1, last_error: 'smtp_failed', created_at: '2026-08-18T00:00:00.000Z', ...over,
});

describe('isStuckRow', () => {
  it('flags failed rows under the attempt limit and stale pending rows', () => {
    expect(isStuckRow({ status: 'failed', attempts: 2, created_at: 'x' }, now())).toBe(true);
    expect(isStuckRow({ status: 'pending', attempts: 0, created_at: '2026-08-18T11:44:00.000Z' }, now())).toBe(true);
  });

  it('rejects failed rows at the limit and fresh pending rows', () => {
    expect(isStuckRow({ status: 'failed', attempts: 3, created_at: 'x' }, now())).toBe(false);
    expect(isStuckRow({ status: 'pending', attempts: 0, created_at: '2026-08-18T11:50:00.000Z' }, now())).toBe(false);
    expect(isStuckRow({ status: 'sent', attempts: 0, created_at: 'x' }, now())).toBe(false);
  });
});

describe('listStuckDeliveries', () => {
  it('returns only stuck rows with their order number', async () => {
    const rows = [
      row({ id: 'd1' }),
      row({ id: 'd2', order_id: 'o2', type: 'order_received', status: 'pending', attempts: 0, created_at: '2026-08-18T11:44:00.000Z' }),
      row({ id: 'd3', status: 'pending', attempts: 0, created_at: '2026-08-18T11:50:00.000Z' }),
      row({ id: 'd4', attempts: 3 }),
    ];
    const client = fakeClient(rows, [{ id: 'o1', display_number: 'RO-1' }, { id: 'o2', display_number: 'RO-2' }]);
    const result = await listStuckDeliveries(client, { now });
    expect(result.map((r) => r.id)).toEqual(['d1', 'd2']);
    expect(result[0]!.orderNumber).toBe('RO-1');
    expect(result[1]!).toMatchObject({ type: 'order_received', status: 'pending', attempts: 0, orderNumber: 'RO-2' });
    expect(result[0]!.lastError).toBe('smtp_failed');
  });

  it('leaves orderNumber null when the order is missing', async () => {
    const client = fakeClient([row()], []);
    const result = await listStuckDeliveries(client, { now });
    expect(result[0]!.orderNumber).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/domain/notification-admin.test.ts`
Expected: FAIL — `isStuckRow` not exported / `listStuckDeliveries` module missing.

- [ ] **Step 3: Extract `isStuckRow`**

In `features/notifications/notification-retry.ts`, add above `retryStuckNotifications`:

```ts
export function isStuckRow(row: { status: string; attempts: number; created_at: string }, now: Date): boolean {
  if (row.status === 'failed') return row.attempts < MAX_ATTEMPTS;
  if (row.status === 'pending') return row.created_at <= new Date(now.getTime() - STALE_PENDING_MS).toISOString();
  return false;
}
```

Then replace the inline `staleCutoff` + `candidates` filter block:

```ts
  const staleCutoff = new Date(now().getTime() - STALE_PENDING_MS).toISOString();

  const candidates = rows.filter((row) => {
    if (row.status === 'failed') return row.attempts < MAX_ATTEMPTS;
    if (row.status === 'pending') return row.created_at <= staleCutoff;
    return false;
  });
```

with:

```ts
  const candidates = rows.filter((row) => isStuckRow(row, now()));
```

(`staleCutoff` is removed entirely.)

- [ ] **Step 4: Write `listStuckDeliveries`**

Create `features/admin/notification-admin.ts`:

```ts
import { isStuckRow } from '@/features/notifications/notification-retry';

type AdminClient = { from: (table: string) => any };

export type StuckDelivery = {
  id: string;
  type: string;
  recipient: string;
  locale: string;
  status: 'pending' | 'failed';
  attempts: number;
  lastError: string | null;
  createdAt: string;
  orderNumber: string | null;
};

type DeliveryRow = { id: string; order_id: string; type: string; recipient: string; locale: string; status: string; attempts: number; last_error: string | null; created_at: string };
type OrderRow = { id: string; display_number: string };

export async function listStuckDeliveries(client: AdminClient, deps: { now?: () => Date } = {}): Promise<StuckDelivery[]> {
  const now = deps.now ?? (() => new Date());
  const { data } = await client.from('notification_deliveries').select('id,order_id,type,recipient,locale,status,attempts,last_error,created_at').in('status', ['failed', 'pending']);
  const rows = (data ?? []) as DeliveryRow[];
  const stuck = rows.filter((r) => isStuckRow({ status: r.status, attempts: r.attempts, created_at: r.created_at }, now()));

  const orderIds = [...new Set(stuck.map((r) => r.order_id))];
  const { data: orders } = orderIds.length ? await client.from('orders').select('id,display_number').in('id', orderIds) : { data: [] };
  const orderMap = new Map<string, string>(((orders ?? []) as OrderRow[]).map((o) => [o.id, o.display_number]));

  return stuck.map((r) => ({
    id: r.id,
    type: r.type,
    recipient: r.recipient,
    locale: r.locale,
    status: r.status as 'pending' | 'failed',
    attempts: r.attempts,
    lastError: r.last_error,
    createdAt: r.created_at,
    orderNumber: orderMap.get(r.order_id) ?? null,
  }));
}
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run tests/domain/notification-admin.test.ts tests/domain/notification-retry.test.ts`
Expected: PASS (5 admin + 8 retry).

- [ ] **Step 6: Commit**

```bash
git add features/notifications/notification-retry.ts features/admin/notification-admin.ts tests/domain/notification-admin.test.ts
git commit -m "Add stuck-delivery list helper and shared isStuckRow predicate"
```

---

### Task 3: Admin retry endpoint

**Files:**
- Create: `app/api/admin/notifications/retry/route.ts`

**Interfaces:**
- Consumes: `getCurrentAdmin` from `@/features/auth/server`; `getAdminSupabase` from `@/lib/supabase/admin`; `retryStuckNotifications` from `@/features/notifications/notification-retry`; `getPublicOrigin` from `@/lib/origin`; `logRouteError` from `@/lib/api`.
- Produces: `POST /api/admin/notifications/retry` → `{ ok: true, summary }`.

- [ ] **Step 1: Write the route**

Create `app/api/admin/notifications/retry/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { getCurrentAdmin } from '@/features/auth/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getPublicOrigin } from '@/lib/origin';
import { logRouteError } from '@/lib/api';
import { retryStuckNotifications } from '@/features/notifications/notification-retry';

export async function POST(request: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Admin authorization required' }, { status: 403 });
  try {
    const summary = await retryStuckNotifications(getAdminSupabase(), { orderUrlBase: getPublicOrigin(request) });
    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    logRouteError('admin notification retry', error);
    return NextResponse.json({ error: 'Could not retry emails' }, { status: 503 });
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run lint` — Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add app/api/admin/notifications/retry/route.ts
git commit -m "Add admin notification retry endpoint"
```

---

### Task 4: Page + button + nav

**Files:**
- Create: `app/admin/notifications/page.tsx`
- Create: `components/admin/RetryEmailsButton.tsx`
- Test: `tests/components/RetryEmailsButton.test.tsx`
- Modify: `components/admin/AdminShell.tsx` (add nav item)
- Modify: `components/admin/AppSidebar.tsx` (add icon)

**Interfaces:**
- Consumes: `listStuckDeliveries` from Task 2; `t` from `getServerT`/`useI18n`; `StatusMessage`, `Button`, `Badge`, `Card`, `Table` UI components.

- [ ] **Step 1: Write the button component test**

Create `tests/components/RetryEmailsButton.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../test-utils';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { RetryEmailsButton } from '@/components/admin/RetryEmailsButton';

beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); vi.clearAllMocks(); });

describe('RetryEmailsButton', () => {
  it('posts to the retry endpoint and shows the summary', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, summary: { retried: 3, sent: 2, failed: 1, skipped: 0 } }) });
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<RetryEmailsButton />);
    await userEvent.click(screen.getByRole('button', { name: 'Retry stuck emails' }));
    expect(await screen.findByText(/Retried 3 · sent 2 · failed 1 · skipped 0/)).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/notifications/retry', { method: 'POST' });
  });

  it('shows an error message when the endpoint fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'x' }) }));
    renderWithProviders(<RetryEmailsButton />);
    await userEvent.click(screen.getByRole('button', { name: 'Retry stuck emails' }));
    expect(await screen.findByText('Could not retry emails.')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/RetryEmailsButton.test.tsx`
Expected: FAIL — module `RetryEmailsButton` missing.

- [ ] **Step 3: Write the button component**

Create `components/admin/RetryEmailsButton.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { StatusMessage } from '@/components/ui/status-message';
import { useI18n } from '@/features/i18n/I18nProvider';

type RetrySummary = { retried: number; sent: number; failed: number; skipped: number };

export function RetryEmailsButton() {
  const router = useRouter();
  const { t } = useI18n();
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function retry() {
    setRunning(true);
    setResult(null);
    try {
      const response = await fetch('/api/admin/notifications/retry', { method: 'POST' });
      const body = (await response.json()) as { ok?: boolean; summary?: RetrySummary };
      if (!response.ok || !body.summary) {
        setResult({ ok: false, message: t('couldNotRetryEmails') });
      } else {
        const s = body.summary;
        setResult({ ok: true, message: t('retrySummary', { retried: s.retried, sent: s.sent, failed: s.failed, skipped: s.skipped }) });
        router.refresh();
      }
    } catch {
      setResult({ ok: false, message: t('couldNotRetryEmails') });
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="grid gap-3">
      {result ? <StatusMessage title={result.message} tone={result.ok ? 'success' : 'error'} /> : null}
      <Button onClick={() => void retry()} disabled={running}>{running ? t('retrying') : t('retryStuckEmails')}</Button>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/components/RetryEmailsButton.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Write the page**

Create `app/admin/notifications/page.tsx`:

```tsx
import { redirect } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { StatusMessage } from '@/components/ui/status-message';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AdminShell } from '@/components/admin/AdminShell';
import { RetryEmailsButton } from '@/components/admin/RetryEmailsButton';
import { listStuckDeliveries } from '@/features/admin/notification-admin';
import { getCurrentAdmin } from '@/features/auth/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getServerT } from '@/features/i18n/server';

const TYPE_KEYS: Record<string, string> = {
  order_received: 'emailOrderReceived',
  payment_confirmed: 'emailPaymentConfirmed',
  payment_failed: 'emailPaymentFailed',
  preparing: 'preparing',
  ready_for_delivery: 'statusReadyForDelivery',
  out_for_delivery: 'statusOutForDelivery',
  delivered: 'statusDelivered',
};

export default async function AdminNotificationsPage() {
  const admin = await getCurrentAdmin();
  if (!admin) redirect('/login');
  const { t } = await getServerT();
  const stuck = await listStuckDeliveries(getAdminSupabase());

  return <AdminShell>
    <p className="text-xs font-bold uppercase tracking-[.16em] text-sage">{t('notificationOperations')}</p>
    <h1 className="font-display text-[clamp(2rem,4vw,3rem)] leading-tight tracking-[-.02em]">{t('notifications')}</h1>
    <RetryEmailsButton />
    <section className="mt-6 grid gap-3">
      <p className="text-xs font-bold uppercase tracking-[.16em] text-sage">{t('stuckEmails')}</p>
      {stuck.length === 0 ? <StatusMessage title={t('noStuckEmails')} /> : (
        <Card><div className="overflow-x-auto"><Table><TableHeader><TableRow>
          <TableHead>{t('orders')}</TableHead><TableHead>{t('emailType')}</TableHead><TableHead>{t('recipient')}</TableHead><TableHead>{t('fulfillment')}</TableHead><TableHead>{t('attempts')}</TableHead><TableHead>{t('createdAt')}</TableHead>
        </TableRow></TableHeader><TableBody>{stuck.map((d) => (
          <TableRow key={d.id}>
            <TableCell className="font-medium">{d.orderNumber ?? '—'}</TableCell>
            <TableCell>{t(TYPE_KEYS[d.type] ?? d.type)}</TableCell>
            <TableCell className="text-sm text-muted-foreground">{d.recipient}</TableCell>
            <TableCell><Badge variant={d.status === 'failed' ? 'destructive' : 'secondary'}>{d.status === 'failed' ? t('statusFailed') : t('statusPending')}</Badge></TableCell>
            <TableCell>{d.attempts}</TableCell>
            <TableCell className="text-sm text-muted-foreground">{new Date(d.createdAt).toLocaleString()}</TableCell>
          </TableRow>
        ))}</TableBody></Table></div></Card>
      )}
    </section>
  </AdminShell>;
}
```

- [ ] **Step 6: Add nav item + icon**

In `components/admin/AdminShell.tsx`, add to `NAV_ITEMS` (after promos):

```ts
  { href: '/admin/notifications', key: 'notifications' },
```

In `components/admin/AppSidebar.tsx`, import `Mail` and add to `ICONS`:

```ts
  '/admin/notifications': Mail,
```

- [ ] **Step 7: Typecheck + full test suite**

Run: `npm run lint` (clean) and `npm test` (expected: 220 + 11 + 5 + 2 = 238 passing).

- [ ] **Step 8: Commit**

```bash
git add app/admin/notifications/page.tsx components/admin/RetryEmailsButton.tsx components/admin/AdminShell.tsx components/admin/AppSidebar.tsx tests/components/RetryEmailsButton.test.tsx
git commit -m "Add admin notifications page with retry button"
```

---

### Task 5: Final verification gate

- [ ] **Step 1: Full suite**

Run: `npm test` — Expected: **238 passing**.

- [ ] **Step 2: Typecheck + build**

Run: `npm run lint` (clean), `npm run build` (succeeds; `/admin/notifications` and `/api/admin/notifications/retry` appear in the route list).

- [ ] **Step 3: Whitespace + secret scan**

Run: `git diff --check` (clean). The secret scan runs inside `npm test`.

- [ ] **Step 4: Discard generated churn**

Run `git checkout -- next-env.d.ts package-lock.json` if `next build` modified them (worktree build needs a local `npm install` first), then `git status --short` to confirm only intended files remain.
