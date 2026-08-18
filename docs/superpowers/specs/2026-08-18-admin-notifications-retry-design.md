# Admin "Retry stuck emails" — design

## Summary

The notification retry job (`retryStuckNotifications`) exists and is triggered by
a secret-protected cron endpoint. This feature gives admins a manual way to run
the same retry and see which deliveries are stuck, via a new `/admin/notifications`
page with a "Retry stuck emails" button and a read-only list of stuck deliveries.

## Scope

- New admin nav entry + page (`/admin/notifications`).
- A "Retry stuck emails" button that runs the retry and shows the summary.
- A read-only list of stuck deliveries (`failed` under the attempt limit, or
  stale `pending`).
- An admin-authenticated endpoint that wraps the existing retry function.

Out of scope: editing/queuing individual deliveries, pagination/search on the
list, and any change to the cron endpoint or the retry policy.

## Components

### 1. Shared stuck predicate

`features/notifications/notification-retry.ts` exports:

```ts
export function isStuckRow(row: { status: string; attempts: number; created_at: string }, now: Date): boolean;
```

It returns `true` for `failed` rows with `attempts < MAX_ATTEMPTS` and for
`pending` rows older than `STALE_PENDING_MS`. `retryStuckNotifications` is
refactored to use it — behavior is unchanged (its tests stay green).

### 2. Stuck-delivery list

New `features/admin/notification-admin.ts`:

```ts
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

export async function listStuckDeliveries(
  client: { from: (table: string) => any },
  deps: { now?: () => Date } = {},
): Promise<StuckDelivery[]>;
```

It selects non-sent rows (`status in ('failed','pending')`), filters with
`isStuckRow`, fetches the distinct orders (`display_number`), and maps
`orderNumber` onto each row.

### 3. Admin endpoint

New `app/api/admin/notifications/retry/route.ts` (POST):

- `getCurrentAdmin()` → `403` if null.
- `retryStuckNotifications(getAdminSupabase(), { orderUrlBase: getPublicOrigin(request) })`.
- Returns `{ ok: true, summary }`; errors → `503` via `logRouteError`.

### 4. Page + button + nav

- `app/admin/notifications/page.tsx` (server component): auth redirect, fetch
  `listStuckDeliveries`, render `AdminShell` with `RetryEmailsButton` and a
  `Card` table (order, type, recipient, status, attempts, created) or a
  `StatusMessage` empty state when there are none.
- `components/admin/RetryEmailsButton.tsx` (client component): a `Button` that
  POSTs the endpoint, renders the `{ retried, sent, failed, skipped }` summary
  through `StatusMessage`, and calls `router.refresh()`.
- `AdminShell` `NAV_ITEMS` gains `{ href: '/admin/notifications', key: 'notifications' }`;
  `AppSidebar` `ICONS` gains `'/admin/notifications': Mail`.

### 5. i18n

New keys in `features/i18n/dictionaries.ts` (EN/AR/FR): `notifications`,
`notificationOperations`, `stuckEmails`, `retryStuckEmails`, `retrying`,
`noStuckEmails`, `retrySummary` (interpolated counts), `emailType`, `attempts`,
`lastError`, `statusFailed`, `emailOrderReceived`, `emailPaymentConfirmed`,
`emailPaymentFailed`.

## Error handling

- The list and the endpoint are best-effort; a data-layer error yields an empty
  list or a `503`, never a crash.
- The retry button shows the summary regardless of individual per-row failures
  (the summary already distinguishes `sent` vs `failed` vs `skipped`).

## Testing

- `tests/domain/notification-admin.test.ts` — `listStuckDeliveries` returns only
  stuck rows (failed under limit + stale pending), attaches `orderNumber`, and
  handles a missing order.
- `tests/components/RetryEmailsButton.test.tsx` — button POSTs and renders the
  summary (mocked `fetch`); empty-summary state.
- `tests/domain/i18n-dictionary.test.ts` — the three locales stay in sync for the
  new keys (existing sync test covers this once keys are added).
- Existing `notification-retry` tests stay green (predicate extraction is
  behavior-preserving).

## Verification

`npm test`, `npm run lint` (`tsc --noEmit`), `npm run build`,
`git diff --check`, repository secret scan.
