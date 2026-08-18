# Notification retry/backfill job — design

## Summary

Order emails are sent best-effort through Gmail SMTP and recorded in
`notification_deliveries`. A send can leave a row stuck in two ways:

- **`failed`** — Gmail rejected/throttled the send (`attempts` currently 1).
- **stale `pending`** — the process died between inserting the pending row and
  writing the final `sent`/`failed` update.

This feature adds a secret-protected cron endpoint that re-sends those rows,
with a bounded retry policy, so transient Gmail failures recover without
manual intervention.

## Scope

- A pure, testable retry function.
- A cron HTTP endpoint (host-agnostic: Render/Fly cron, GitHub Actions, or a
  manual request).
- A `CRON_SECRET` env var and docs.

Out of scope: an admin "retry now" button, an email provider swap, and any
change to the existing send path or order/payment/fulfillment flow.

## Data model

No schema change. Reused columns on `notification_deliveries`:

| column | role in retry |
| --- | --- |
| `status` | `pending` / `sent` / `failed` |
| `attempts` | total send attempts; drives the give-up limit |
| `created_at` | detects stale `pending` rows |
| `last_error` | last failure reason (`smtp_failed`, `order_missing`, `unknown_type`) |
| `sent_at` | set on success |
| `type`, `recipient`, `locale`, `order_id` | inputs to re-send |

The existing index `notification_pending_idx (status, created_at)` supports the
stale-pending query.

## Components

### 1. `features/notifications/notification-retry.ts`

```ts
export const MAX_ATTEMPTS = 3;
export const STALE_PENDING_MS = 15 * 60 * 1000;

export type RetrySummary = { retried: number; sent: number; failed: number; skipped: number };

export async function retryStuckNotifications(
  client: { from: (table: string) => any },
  deps: { sendNotification?: typeof sendOrderNotification; now?: () => Date; orderUrlBase?: string } = {},
): Promise<RetrySummary>;
```

Algorithm:

1. Select `id, order_id, type, recipient, locale, attempts, status, created_at`
   from `notification_deliveries` where `status in ('failed', 'pending')` — the
   non-sent superset. Filtering is done in JS so the rules are unit-tested:
   - `failed` rows are candidates when `attempts < MAX_ATTEMPTS`.
   - `pending` rows are candidates when `created_at <= now - STALE_PENDING_MS`.
   - Anything else is counted `skipped` and not sent.
2. For each candidate row, in order:
   - Validate `type` against the known `NotificationType` set; unknown → mark
     `failed` with `last_error = 'unknown_type'`, count `skipped`.
   - Fetch the order (`display_number`, `total_minor`, `public_token`); missing →
     mark `failed` with `last_error = 'order_missing'`, count `skipped`.
   - Re-send via `sendOrderNotification` with the stored `type`/`recipient`/
     `locale` and the rebuilt order URL
     `{orderUrlBase}/orders/{order_id}?token={public_token}`.
   - Update the row: `attempts = attempts + 1`, `status = sent` (+ `sent_at`) or
     `failed` (+ `last_error = 'smtp_failed'`).
3. Return `{ retried, sent, failed, skipped }` where `retried = sent + failed`;
   never throw (a bad row must not abort the batch).

`deps` are injected so tests run without live services or a clock.

### 2. `app/api/cron/notifications/route.ts`

- Handles `GET` and `POST` (schedulers differ).
- Reads `Authorization: Bearer <CRON_SECRET>`; compares to
  `getRequiredServerEnv('CRON_SECRET')` with a constant-time compare. Mismatch
  or missing → `401`.
- `orderUrlBase` = `SITE_URL` (falling back to the request origin), matching
  `getPublicOrigin`.
- Calls `retryStuckNotifications(getAdminSupabase(), { orderUrlBase })` and
  returns `{ ok: true, summary }`. On unexpected error → `503` via
  `logRouteError`.

### 3. Config

- Add `CRON_SECRET` to the `serverKeys` list in `lib/server-env.ts`.
- Add `CRON_SECRET=` to `.env.example`.
- Document in the runbook env table and `docs/operations/payments-email-chat.md`.

## Error handling

- The retry function is best-effort and non-transactional: each row is
  independent, and a per-row failure is recorded on that row, not thrown.
- A permanently bad recipient (invalid email) will exhaust `MAX_ATTEMPTS` and
  remain `failed` for manual review — this is intentional.
- The endpoint is idempotent in effect: re-running it only touches rows that
  still match the stuck predicate.

## Testing

`tests/domain/notification-retry.test.ts` (fake client + fake transport + fixed
clock):

- `failed` row with `attempts < 3` → re-sent and marked `sent`, `attempts`
  incremented.
- stale `pending` row → re-sent and marked `sent`.
- fresh `pending` row → skipped (no send).
- `failed` row at `attempts = 3` → skipped.
- send failure → row marked `failed`, `attempts` incremented, `last_error`
  set.
- unknown `type` → marked `failed` with `unknown_type`, counted `skipped`.
- missing order → marked `failed` with `order_missing`, counted `skipped`.
- summary counts are correct.

## Verification

- `npm test` (existing 220 + new tests).
- `npm run lint` (`tsc --noEmit`).
- `npm run build`.
- `git diff --check` and the repository secret scan.
