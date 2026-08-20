# Rosette email preferences and unsubscribe — design

**Date:** 2026-08-20
**Status:** Approved for implementation planning

## Goal

Give customers control over optional engagement email while preserving essential
order communication. Abandoned-cart recovery and wishlist price/stock alerts
will support a signed one-click unsubscribe link and a matching signed-in
account control. Payment, cancellation, and delivery notifications remain
transactional and cannot be disabled by this feature.

## Scope decisions

- **Opt-out scope:** engagement email only — abandoned-cart and wishlist alerts.
- **Preference identity:** normalized email address, not account ID. This works
  for guests captured by abandoned-cart recovery and keeps an account's setting
  consistent with unsubscribe links.
- **Default:** an email is opted in when no preference row exists.
- **Security:** unsubscribe links carry an HMAC signature generated from the
  normalized email and a server-only `EMAIL_PREFERENCES_SECRET`; the database
  does not store bearer tokens.
- **Failure policy:** engagement sends fail closed if the preference lookup
  errors. The cron leaves the event eligible for a later retry where possible.
- **Transactional boundary:** order received, payment, cancellation, change,
  and fulfillment emails are not suppressed and do not receive an engagement
  unsubscribe action.

## Data model — migration `015_email_preferences.sql`

Create `public.email_preferences`:

- `email text primary key` — normalized lowercase/trimmed email
- `engagement_enabled boolean not null default true`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Enable RLS with no public policies. All reads and writes use the existing
service-role client, just like carts and notification delivery jobs. Add
`carts.engagement_suppressed_at timestamptz` so an opted-out abandoned cart is
not reconsidered on every cron run; the existing `last_emailed_at` retains its
meaning of a successfully sent message.

The migration is idempotent and adds indexes only where needed. Existing rows
need no backfill because the service treats a missing preference as enabled.

## Preference service and signed links

Add `features/email-preferences/preferences-service.ts` with small, testable
functions:

- `normalizeEmail(value)` — trim and lowercase; reject empty or malformed
  values using the existing email validation convention.
- `createPreferenceToken(email, secret)` — HMAC-SHA256 over the normalized
  email, returned as base64url.
- `verifyPreferenceToken(email, token, secret)` — timing-safe comparison,
  returning the normalized email only when valid.
- `getEngagementPreference(client, email)` — returns enabled for a missing row,
  disabled for an explicit opt-out, and an error result when the database read
  fails.
- `setEngagementPreference(client, email, enabled)` — idempotent upsert.
- `buildUnsubscribeUrl(origin, email, secret, locale?)` — creates the signed
  URL for `/api/email-preferences/unsubscribe?email=...&token=...`, carrying
  the optional `en`/`ar`/`fr` locale for the confirmation response.

The service never logs email addresses, tokens, or secrets.

## Unsubscribe endpoint

Add `app/api/email-preferences/unsubscribe/route.ts`:

- Supports `GET` for a customer clicking the visible email link and `POST` for
  email clients supporting RFC 8058 one-click unsubscribe.
- Validates the email/token pair before writing.
- Uses the optional signed-link locale only for response copy; it never affects
  preference lookup or authorization.
- Writes `engagement_enabled = false` and returns an idempotent localized
  confirmation response; invalid or missing credentials return `400` without
  revealing whether an email has a preference row.
- Uses `EMAIL_PREFERENCES_SECRET` from `lib/server-env.ts` and does not require
  authentication.

Add `EMAIL_PREFERENCES_SECRET` to `.env.example`, the setup/runbook env table,
operations documentation, and the server-key allowlist. Engagement messages
include both a visible unsubscribe link and `List-Unsubscribe` /
`List-Unsubscribe-Post` headers where the mail transport supports custom
headers.

## Engagement email integration

### Abandoned cart

Update `runAbandonedCartCron` to:

1. Select carts that are unconverted, stale, not successfully emailed, and not
   already suppressed.
2. Resolve the normalized email preference before sending.
3. On explicit opt-out, set `engagement_suppressed_at`, increment a
   `suppressed` summary count, and do not send.
4. On preference lookup failure, count a failure and leave the cart eligible.
5. On enabled, build the signed unsubscribe URL and pass it to
   `sendAbandonedCartEmail`; stamp `last_emailed_at` only after a successful
   send.

`renderAbandonedCartEmail` adds the optional localized unsubscribe copy and
link. Existing injected transport tests remain usable without a configured
secret by passing the URL explicitly.

### Wishlist

Update `runWishlistCron` to check the preference before consuming a watch event:

1. Evaluate the price/stock change.
2. If no change, update the snapshot as today.
3. If the preference is explicitly disabled, update the snapshot, increment a
   `suppressed` count, and do not send.
4. If preference lookup fails, count a failure and leave the old snapshot so the
   event can be retried.
5. If enabled, build the signed unsubscribe URL, send the email with it, then
   update the snapshot as today.

`renderWishlistEmail` adds localized unsubscribe copy/link and the same
one-click headers through the mailer input.

## Account control

Extend the existing account profile surface with an `EmailPreferences` client
component and a server action in `features/account/actions.ts`:

- display the current email-wide engagement state
- allow an authenticated customer to enable or disable engagement email
- use the existing `getCurrentCustomer` identity and service-role preference
  service
- revalidate the account profile path after a successful update
- leave sign-out and profile editing behavior unchanged

Add the required EN/AR/FR dictionary keys for the setting label, explanation,
save state, unsubscribe confirmation, and invalid-link response.

## Error handling and privacy

- Invalid unsubscribe signatures never disclose whether the address exists.
- Preference reads fail closed for engagement sends; transactional sends are
  unaffected because they do not consult this table.
- Suppressed carts are marked once, avoiding repeated work and duplicate
  summary counts.
- Wishlist snapshots are not advanced when a preference lookup fails, avoiding
  loss of a notification event during a transient database problem.
- No preference data, signatures, or URLs containing tokens are logged.
- The feature does not add public RLS access to customer email preferences.

## Testing

Add focused tests for:

1. email normalization, HMAC token creation/verification, malformed and
   tampered tokens, and timing-safe mismatch handling;
2. missing/default, enabled, disabled, and database-error preference reads;
3. idempotent opt-in/opt-out writes;
4. abandoned-cart suppression, lookup failure retryability, and unsubscribe
   URL propagation;
5. wishlist suppression, lookup failure without snapshot loss, and URL
   propagation;
6. localized unsubscribe copy and link rendering in both engagement templates;
7. account preference action/component behavior;
8. endpoint validation and GET/POST response behavior;
9. dictionary completeness across EN/AR/FR.

Final verification: `npm test`, `npm run lint`, `npm run build`,
`git diff --check`, and the repository secret scan.

## Explicit non-goals

- No marketing newsletter or campaign-management system.
- No suppression of payment, cancellation, fulfillment, or other transactional
  order notifications.
- No per-product notification frequency settings.
- No admin preference-management dashboard in v1.
- No change to Gmail, Supabase, or cron providers.
