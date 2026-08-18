# Notification Retry/Backfill Job Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a secret-protected cron endpoint that re-sends `notification_deliveries` rows stuck in `failed` or stale `pending`, with a bounded retry policy.

**Architecture:** A pure `retryStuckNotifications` function fetches non-sent rows, filters candidates in JS (`failed` with `attempts < 3`, `pending` older than 15 min), re-fetches each order to rebuild the email, re-sends through the existing `sendOrderNotification`, and updates the row. A thin route guards it with a timing-safe `CRON_SECRET` bearer check.

**Tech Stack:** Next.js 16 (App Router route handler), TypeScript, Supabase JS client, nodemailer (via the existing notification service), Vitest.

**Spec:** `docs/superpowers/specs/2026-08-18-notification-retry-design.md`

## Global Constraints

- No live services in tests — inject a fake client + fake transport + fixed clock.
- No schema change; reuse `notification_deliveries` columns as-is.
- Never throw from `retryStuckNotifications` (a bad row must not abort the batch).
- Reuse `sendOrderNotification` from `@/features/notifications/notification-service` (signature unchanged).
- Existing email types: `NotificationType = 'order_received' | 'payment_confirmed' | 'payment_failed' | 'preparing' | 'ready_for_delivery' | 'out_for_delivery' | 'delivered'`.
- `MAX_ATTEMPTS = 3`, `STALE_PENDING_MS = 15 * 60 * 1000`.

---

### Task 1: Retry function (TDD)

**Files:**
- Create: `features/notifications/notification-retry.ts`
- Test: `tests/domain/notification-retry.test.ts`

**Interfaces:**
- Consumes: `sendOrderNotification(input, injectedTransport?)` from `@/features/notifications/notification-service`; `NotificationType`, `EmailLocale` from `@/features/notifications/email-types`.
- Produces: `retryStuckNotifications(client, deps?) => Promise<RetrySummary>` where `RetrySummary = { retried: number; sent: number; failed: number; skipped: number }`; exports `MAX_ATTEMPTS`, `STALE_PENDING_MS`.

- [ ] **Step 1: Write the failing test**

Create `tests/domain/notification-retry.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { MAX_ATTEMPTS, retryStuckNotifications } from '@/features/notifications/notification-retry';

type DeliveryRow = { id: string; order_id: string; type: string; recipient: string; locale: string; attempts: number; status: string; created_at: string };
type OrderRow = { display_number: string; total_minor: number; public_token: string | null };
type Call = { table: string; op: string; payload?: unknown; id?: string };

function fakeClient(rows: DeliveryRow[], orders: Record<string, OrderRow>) {
  const calls: Call[] = [];
  const from = (table: string) => {
    if (table === 'notification_deliveries') {
      return {
        select: () => ({ in: () => ({ data: rows, error: null }) }),
        update: (payload: unknown) => ({
          eq: (_col: string, id: string) => { calls.push({ table, op: 'update', payload, id }); return { error: null }; },
        }),
      };
    }
    return {
      select: () => ({
        eq: (_col: string, value: string) => ({ maybeSingle: async () => ({ data: orders[value] ?? null, error: null }) }),
      }),
    };
  };
  return { client: { from }, calls };
}

const order = { display_number: 'RO-1', total_minor: 12300, public_token: 'tok' };
const sendOk = async () => ({ accepted: true as const });
const sendFail = async () => ({ accepted: false as const, retryable: true as const });
const now = () => new Date('2026-08-18T12:00:00.000Z');
// 15-min stale cutoff => 2026-08-18T11:45:00.000Z

const failedRow = (over: Partial<DeliveryRow> = {}): DeliveryRow => ({
  id: 'd1', order_id: 'o1', type: 'delivered', recipient: 'buyer@example.com', locale: 'en', attempts: 1, status: 'failed', created_at: '2026-08-18T00:00:00.000Z', ...over,
});

describe('retryStuckNotifications', () => {
  it('re-sends a failed row under the attempt limit and marks it sent', async () => {
    const { client, calls } = fakeClient([failedRow()], { o1: order });
    const summary = await retryStuckNotifications(client, { sendNotification: sendOk, now });
    expect(summary).toEqual({ retried: 1, sent: 1, failed: 0, skipped: 0 });
    const update = calls.find((c) => c.table === 'notification_deliveries' && c.op === 'update');
    expect(update!.payload).toMatchObject({ status: 'sent', attempts: 2 });
  });

  it('re-sends a stale pending row', async () => {
    const row = failedRow({ status: 'pending', attempts: 0, created_at: '2026-08-18T11:44:00.000Z' });
    const { client, calls } = fakeClient([row], { o1: order });
    const summary = await retryStuckNotifications(client, { sendNotification: sendOk, now });
    expect(summary).toEqual({ retried: 1, sent: 1, failed: 0, skipped: 0 });
    expect(calls.some((c) => c.table === 'notification_deliveries' && c.op === 'update')).toBe(true);
  });

  it('skips a fresh pending row', async () => {
    const row = failedRow({ status: 'pending', attempts: 0, created_at: '2026-08-18T11:50:00.000Z' });
    const { client, calls } = fakeClient([row], { o1: order });
    const summary = await retryStuckNotifications(client, { sendNotification: sendOk, now });
    expect(summary).toEqual({ retried: 0, sent: 0, failed: 0, skipped: 1 });
    expect(calls).toEqual([]);
  });

  it('skips a failed row that already reached the attempt limit', async () => {
    const row = failedRow({ attempts: MAX_ATTEMPTS });
    const { client, calls } = fakeClient([row], { o1: order });
    const summary = await retryStuckNotifications(client, { sendNotification: sendOk, now });
    expect(summary).toEqual({ retried: 0, sent: 0, failed: 0, skipped: 1 });
    expect(calls).toEqual([]);
  });

  it('marks a row failed and increments attempts when the send fails', async () => {
    const { client, calls } = fakeClient([failedRow()], { o1: order });
    const summary = await retryStuckNotifications(client, { sendNotification: sendFail, now });
    expect(summary).toEqual({ retried: 1, sent: 0, failed: 1, skipped: 0 });
    const update = calls.find((c) => c.table === 'notification_deliveries' && c.op === 'update');
    expect(update!.payload).toMatchObject({ status: 'failed', attempts: 2, last_error: 'smtp_failed' });
  });

  it('marks an unknown type failed without sending', async () => {
    const row = failedRow({ type: 'not_a_type' });
    const { client, calls } = fakeClient([row], { o1: order });
    const summary = await retryStuckNotifications(client, { sendNotification: sendOk, now });
    expect(summary).toEqual({ retried: 0, sent: 0, failed: 0, skipped: 1 });
    const update = calls.find((c) => c.table === 'notification_deliveries' && c.op === 'update');
    expect(update!.payload).toMatchObject({ status: 'failed', last_error: 'unknown_type' });
  });

  it('marks a row failed when its order is missing', async () => {
    const { client, calls } = fakeClient([failedRow()], {});
    const summary = await retryStuckNotifications(client, { sendNotification: sendOk, now });
    expect(summary).toEqual({ retried: 0, sent: 0, failed: 0, skipped: 1 });
    const update = calls.find((c) => c.table === 'notification_deliveries' && c.op === 'update');
    expect(update!.payload).toMatchObject({ status: 'failed', last_error: 'order_missing' });
  });

  it('builds the order URL from the orderUrlBase + public token', async () => {
    const sent: Array<string> = [];
    const send = async (input: { orderUrl: string }) => { sent.push(input.orderUrl); return { accepted: true as const }; };
    const { client } = fakeClient([failedRow()], { o1: { ...order, public_token: 'tok-123' } });
    await retryStuckNotifications(client, { sendNotification: send as never, now, orderUrlBase: 'https://shop.example.com/' });
    expect(sent[0]).toBe('https://shop.example.com/orders/o1?token=tok-123');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/domain/notification-retry.test.ts`
Expected: FAIL — `Cannot find module '@/features/notifications/notification-retry'`.

- [ ] **Step 3: Write the implementation**

Create `features/notifications/notification-retry.ts`:

```ts
import { sendOrderNotification } from './notification-service';
import type { EmailLocale, NotificationType } from './email-types';

export const MAX_ATTEMPTS = 3;
export const STALE_PENDING_MS = 15 * 60 * 1000;

const NOTIFICATION_TYPES = new Set<NotificationType>([
  'order_received', 'payment_confirmed', 'payment_failed', 'preparing', 'ready_for_delivery', 'out_for_delivery', 'delivered',
]);

type RetryClient = { from: (table: string) => any };
export type RetrySummary = { retried: number; sent: number; failed: number; skipped: number };

type DeliveryRow = { id: string; order_id: string; type: string; recipient: string; locale: string; attempts: number; status: string; created_at: string };
type OrderRow = { display_number: string; total_minor: number; public_token: string | null };

export async function retryStuckNotifications(
  client: RetryClient,
  deps: { sendNotification?: typeof sendOrderNotification; now?: () => Date; orderUrlBase?: string } = {},
): Promise<RetrySummary> {
  const send = deps.sendNotification ?? sendOrderNotification;
  const now = deps.now ?? (() => new Date());
  const base = (deps.orderUrlBase ?? '').replace(/\/$/, '');
  const summary: RetrySummary = { retried: 0, sent: 0, failed: 0, skipped: 0 };

  const { data } = await client.from('notification_deliveries').select('id,order_id,type,recipient,locale,attempts,status,created_at').in('status', ['failed', 'pending']);
  const rows = (data ?? []) as DeliveryRow[];
  const staleCutoff = new Date(now().getTime() - STALE_PENDING_MS).toISOString();

  const candidates = rows.filter((row) => {
    if (row.status === 'failed') return row.attempts < MAX_ATTEMPTS;
    if (row.status === 'pending') return row.created_at <= staleCutoff;
    return false;
  });
  summary.skipped += rows.length - candidates.length;

  for (const row of candidates) {
    if (!NOTIFICATION_TYPES.has(row.type as NotificationType)) {
      summary.skipped += 1;
      await client.from('notification_deliveries').update({ status: 'failed', last_error: 'unknown_type' }).eq('id', row.id);
      continue;
    }
    const { data: order } = await client.from('orders').select('display_number,total_minor,public_token').eq('id', row.order_id).maybeSingle();
    if (!order) {
      summary.skipped += 1;
      await client.from('notification_deliveries').update({ status: 'failed', last_error: 'order_missing' }).eq('id', row.id);
      continue;
    }
    const orderRow = order as OrderRow;
    const result = await send({
      locale: row.locale as EmailLocale,
      type: row.type as NotificationType,
      orderNumber: orderRow.display_number,
      totalMinor: orderRow.total_minor,
      recipientEmail: row.recipient,
      orderUrl: `${base}/orders/${row.order_id}?token=${encodeURIComponent(orderRow.public_token ?? '')}`,
    });
    summary.retried += 1;
    if (result.accepted) {
      summary.sent += 1;
      await client.from('notification_deliveries').update({ status: 'sent', sent_at: now().toISOString(), attempts: row.attempts + 1, last_error: null }).eq('id', row.id);
    } else {
      summary.failed += 1;
      await client.from('notification_deliveries').update({ status: 'failed', attempts: row.attempts + 1, last_error: 'smtp_failed' }).eq('id', row.id);
    }
  }
  return summary;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/domain/notification-retry.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add features/notifications/notification-retry.ts tests/domain/notification-retry.test.ts
git commit -m "Add notification retry function for stuck email deliveries"
```

---

### Task 2: Cron auth helper + endpoint + config

**Files:**
- Create: `lib/cron.ts`
- Create: `app/api/cron/notifications/route.ts`
- Test: `tests/lib/cron.test.ts`
- Modify: `lib/server-env.ts` (add `'CRON_SECRET'` to `serverKeys`)
- Modify: `.env.example` (add `CRON_SECRET=`)

**Interfaces:**
- Consumes: `retryStuckNotifications` from Task 1; `getAdminSupabase` from `@/lib/supabase/admin`; `getPublicOrigin` from `@/lib/origin`; `getRequiredServerEnv` from `@/lib/server-env`; `logRouteError` from `@/lib/api`.
- Produces: `isCronAuthorized(authorization: string | null, secret: string): boolean`; route handlers `GET` and `POST` on `/api/cron/notifications`.

- [ ] **Step 1: Write the failing test**

Create `tests/lib/cron.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { isCronAuthorized } from '@/lib/cron';

describe('cron authorization', () => {
  it('authorizes a matching bearer token', () => {
    expect(isCronAuthorized('Bearer abc123', 'abc123')).toBe(true);
  });

  it('rejects a wrong token', () => {
    expect(isCronAuthorized('Bearer nope', 'abc123')).toBe(false);
  });

  it('rejects a missing header', () => {
    expect(isCronAuthorized(null, 'abc123')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/cron.test.ts`
Expected: FAIL — `Cannot find module '@/lib/cron'`.

- [ ] **Step 3: Write the implementation**

Create `lib/cron.ts`:

```ts
import { timingSafeEqual } from 'node:crypto';

export function isCronAuthorized(authorization: string | null, secret: string): boolean {
  const token = (authorization ?? '').startsWith('Bearer ') ? authorization!.slice('Bearer '.length) : '';
  const provided = Buffer.from(token);
  const expected = Buffer.from(secret);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/cron.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Add the env key**

Modify `lib/server-env.ts` — add `'CRON_SECRET',` to the `serverKeys` array (after `'SITE_URL',`).

Modify `.env.example` — add under the `SITE_URL=` block:

```bash
# Shared secret for the notification retry cron endpoint. Any scheduler
# (Render/Fly cron, GitHub Actions) must send it as `Authorization: Bearer <CRON_SECRET>`.
CRON_SECRET=
```

- [ ] **Step 6: Write the route**

Create `app/api/cron/notifications/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getRequiredServerEnv } from '@/lib/server-env';
import { getPublicOrigin } from '@/lib/origin';
import { logRouteError } from '@/lib/api';
import { isCronAuthorized } from '@/lib/cron';
import { retryStuckNotifications } from '@/features/notifications/notification-retry';

async function handle(request: Request) {
  try {
    if (!isCronAuthorized(request.headers.get('authorization'), getRequiredServerEnv('CRON_SECRET'))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const summary = await retryStuckNotifications(getAdminSupabase(), { orderUrlBase: getPublicOrigin(request) });
    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    logRouteError('notification retry', error);
    return NextResponse.json({ error: 'Retry job failed' }, { status: 503 });
  }
}

export async function GET(request: Request) { return handle(request); }
export async function POST(request: Request) { return handle(request); }
```

- [ ] **Step 7: Typecheck + commit**

Run: `npm run lint` — Expected: clean.

```bash
git add lib/cron.ts app/api/cron/notifications/route.ts tests/lib/cron.test.ts lib/server-env.ts .env.example
git commit -m "Add secret-protected notification retry cron endpoint"
```

---

### Task 3: Documentation

**Files:**
- Modify: `docs/operations/payments-email-chat.md`
- Modify: `docs/setup/runbook.md`

- [ ] **Step 1: Document retry behavior + scheduler**

In `docs/operations/payments-email-chat.md`, under the **Gmail SMTP** section, append:

```markdown
### Retry job

A cron endpoint retries deliveries stuck in `failed` (up to 3 attempts) or
stale `pending` (older than 15 minutes):

```text
POST /api/cron/notifications
Authorization: Bearer <CRON_SECRET>
```

Point any scheduler (Render cron, Fly.io machines, or a GitHub Actions
`schedule` workflow) at it. The response reports
`{ retried, sent, failed, skipped }`. Set `CRON_SECRET` in the environment;
`SITE_URL` must also be set so the retried email links use the public domain.
```

- [ ] **Step 2: Update the runbook env table**

In `docs/setup/runbook.md`, section 6 (`.env.local`), add a row to the table:

```markdown
| `CRON_SECRET` | a random string shared with your scheduler (e.g. `openssl rand -hex 32`) |
```

And in section 7 (end-to-end verification) after the admin step, add:

```markdown
10. Configure the retry cron (Section 3 of
    `docs/operations/payments-email-chat.md`) and trigger it once manually;
    stuck `notification_deliveries` rows move to `sent`/`failed`.
```

- [ ] **Step 3: Commit**

```bash
git add docs/operations/payments-email-chat.md docs/setup/runbook.md
git commit -m "Document the notification retry cron job"
```

---

### Task 4: Final verification gate

- [ ] **Step 1: Full test suite**

Run: `npm test` — Expected: 220 existing + 11 new (8 retry + 3 cron) = **231 passing**.

- [ ] **Step 2: Typecheck + build**

Run: `npm run lint` (clean), `npm run build` (succeeds).

- [ ] **Step 3: Whitespace + secret scan**

Run: `git diff --check` (clean). The `no-secrets` test runs inside `npm test`.

- [ ] **Step 4: Discard generated churn**

Run `git checkout -- next-env.d.ts` if `next build` modified it, then `git status --short` to confirm only intended files remain.
