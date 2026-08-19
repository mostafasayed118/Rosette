# Abandoned-cart recovery emails — design

Date: 2026-08-19

## Problem

The cart lives only in the browser (`localStorage`, key `rosette.cart.v1`), and the
shopper's email is not captured until the final "place order" click on checkout. There
is therefore no server-side record of an in-progress cart, and no way to email a
shopper who leaves before completing an order.

This feature adds three things: **server-side cart persistence**, **opt-in email
capture**, and a **cron that emails shoppers who abandoned their cart**. It reuses the
existing cart data shape, the Supabase service-role write pattern, the CRON_SECRET cron
guard, and the gmail mailer.

## Non-goals / out of scope (v1)

- Discount-code incentive in the recovery email.
- A multi-email drip series (v1 sends exactly one recovery email per cart).
- An "add to bag" capture modal — the guest capture point is the cart page.
- An admin view of carts.
- Durable, distributed rate limiting (v1 uses a lightweight in-process limiter).
- Any behavior change to the local demo mode (see "Local demo mode" below).

## Data model — migration `013_abandoned_carts`

Table `public.carts`:

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | pk, `gen_random_uuid()` |
| `email` | `text not null` | canonical identity (guests and signed-in both have one) |
| `customer_id` | `uuid null` | FK → `profiles(id) on delete cascade`; null for guests |
| `locale` | `text not null default 'en'` | `en`/`ar`/`fr`; drives email language |
| `city` | `text not null default 'cairo'` | city slug for the recovery URL |
| `lines` | `jsonb not null` | serialized `CartLine[]` |
| `restore_token` | `text not null` | opaque token for the recovery link |
| `created_at` | `timestamptz not null default now()` | |
| `updated_at` | `timestamptz not null default now()` | set on every sync |
| `last_emailed_at` | `timestamptz null` | null until the recovery email is sent |
| `converted_at` | `timestamptz null` | set when the shopper places an order |

Invariants and indexes:

- **One active cart per email**: partial unique index
  `create unique index carts_email_active_idx on public.carts (email) where converted_at is null`.
  A converted cart frees the email, so the same shopper can start a fresh cart later.
- Unique index on `restore_token`.
- RLS enabled with **no policies** — every read and write goes through the service-role
  client, which bypasses RLS. There is no anon/authenticated read path in v1 (the live
  bag stays in localStorage; the server row is a snapshot for recovery + email).

The `lines` jsonb is a **snapshot** of the cart at sync time. It is only ever used for
the recovery email's item list and to restore the bag; it is never trusted for pricing at
order time (orders already re-derive totals from the cart the client submits).

## Capture & sync

### Signed-in customers (automatic)

A new `CartSync` client component, mounted in the storefront layout inside `CartProvider`,
watches the cart and the auth state. When the customer is signed in, every cart change
POSTs the cart to the sync route; the route resolves the email from the auth user (the
body email is ignored). No prompt is shown.

### Guests (opt-in)

An optional, dismissible **"Email me my bag"** field on the cart page. When the shopper
enters a valid email, the client POSTs the cart to the sync route with that email and
shows "Saved — we'll hold this for you." The field is a small, non-blocking control; it
is not a modal and does not interrupt adding items.

### Capture activation

Both the `CartSync` auto-sync and the guest field check `getBrowserSupabase()` on the
client and are inert when Supabase is not configured (local demo mode).

## Sync API

`POST /api/cart/sync` — body `{ email, locale, city, lines }`.

- If signed in (`getCurrentCustomer()`), the route uses the auth user's email and sets
  `customer_id`; otherwise it uses the validated body email with `customer_id = null`.
- `lines` is validated to be an array of well-formed cart lines (slug + positive
  quantity + numeric prices), capped in length.
- The route upserts the cart by email and returns `{ restoreToken }`.
- **Security (approved):** the guest path is an unauthenticated write keyed by email.
  Mitigations: (1) strict email validation, (2) an in-process rate limit (5 syncs per
  email per minute), and (3) the cron sends at most one recovery email per cart
  (`last_emailed_at`). The worst case is a single "your bag is waiting" email to an
  address that did not opt in — acceptable for this storefront.

The sync service is a pure, testable module:

```
upsertCart(client, { email, customerId, locale, city, lines }): Promise<{ status: 'ok', restoreToken } | { status: 'invalid' | 'failure' }>
```

It generates a fresh `restore_token` on insert and refreshes it on each update (the
latest sync always owns the working link).

## Conversion

When an order is placed:

- **Supabase mode** (`/api/orders` route): after `createPending` succeeds, call
  `markCartConverted(client, { email: checkout.senderEmail })`, which sets
  `converted_at = now()` on the matching active cart (`email = $1 and converted_at is null`).
- **Local demo mode**: no-op (there is no server cart).

A converted cart is never emailed, even if its `updated_at` is older than the threshold.

## Recovery cron

`POST /api/cron/abandoned-carts` (also `GET`), CRON_SECRET-guarded via `isCronAuthorized`,
mirroring `/api/cron/wishlist`.

The cron function is pure and testable (injected `send` + `now`):

```
runAbandonedCartCron(client, { origin, send, now })
  → { checked: number; sent: number; failed: number }
```

Selection: carts where `converted_at is null and last_emailed_at is null and
updated_at < now - 24h`. For each row:

1. Render the email (EN/AR/FR from `locale`) and send it via the injected mailer.
2. Stamp `last_emailed_at = now()` so it is never re-sent.
3. Best-effort per row (a send failure increments `failed` but does not abort the run);
   a failed row is retried on the next run because `last_emailed_at` is only stamped on
   success.

The email is sent directly through the gmail mailer (the order-shaped
`notification_deliveries`/retry machinery cannot re-render a cart email), exactly like
the wishlist emails.

## Recovery email

New `features/cart/abandoned-email.ts`:

- `renderAbandonedCartEmail({ locale, items, totalMinor, restoreUrl })` → `{ subject, text, html }`.
- `sendAbandonedCartEmail(input, transport)` via `createGmailTransport()`.
- Uses `escapeHtml` (exported from `features/notifications/email-templates`) and the same
  EGP money formatting the wishlist email uses.
- The `from` address is `GMAIL_FROM` (required env), like `sendOrderNotification` — not a
  hardcoded placeholder.
- Copy (all three locales): a "your Rosette bag is waiting" subject, a list of the saved
  items with their totals, and a "finish your order" link to
  `${origin}/${locale}/${city}/cart?restore=<token>`.

## Cross-device restore

The recovery link lands on `/cart?restore=<token>`. A client component on the cart page
detects the token, calls `GET /api/cart/restore?token=…`, and restores the returned
`lines` into the local bag:

- If the local bag is empty → replace it and render the restored cart.
- If the local bag has items → show a "restore your saved bag?" prompt (replace or
  discard), rather than silently overwriting the shopper's current selection.
- After restoring, the URL is cleaned of the query param.

`GET /api/cart/restore` reads via the service-role client and returns `{ lines }` or 404
for an unknown/expired token. The token is the credential, so the read is not RLS-scoped.

## i18n

~7 keys × 3 locales (EN/AR/FR): `emailMeMyBag`, `emailLabel`, `bagSaved`,
`saveBagHint`, `restorePrompt`, `restoreNow`, `restoreDiscard`, plus email subject/copy
strings that live in `abandoned-email.ts` (like the wishlist email, not in the
dictionary).

## Local demo mode

No Supabase env → the capture UI and `CartSync` are inert, and `/api/cron/abandoned-carts`
returns a graceful 503 (matching `/api/cron/wishlist` today). The demo storefront keeps
working unchanged.

## Error handling

- Sync route: invalid email/lines → 400; rate-limited → 429; unexpected → 503 (logged).
- Restore route: unknown token → 404; unexpected → 503.
- Cron: unauthorized → 401; unexpected → 503 (logged), send failures recorded per-row.

## Testing

- **Sync service** (fakes): upsert-on-insert vs update, `restore_token` refresh, invalid
  lines rejection, `markCartConverted` only touches the active cart.
- **Cron detection** (pure, injected `send`/`now`): selects only stale + un-emailed +
  unconverted; skips converted/recent/already-emailed; stamps `last_emailed_at` only on
  success; reports `sent`/`failed`/`checked`.
- **Email render** (pure): subject/copy per locale, item list, restore link, escaping.
- **Restore hook** (component): token → fetch → replace-when-empty / prompt-when-nonempty,
  URL cleanup.
- **Capture field + `CartSync`** (component): signed-in auto-sync fires on change; guest
  field validates + syncs + shows "saved"; inert without Supabase.
- Full gate (all tests + lint + build).

## Phases (for the implementation plan)

1. Migration `013` + cart-line validation/serialization.
2. Sync service + `/api/cart/sync` + `/api/cart/restore` + conversion in `/api/orders`.
3. `CartSync` (signed-in auto) + guest email-capture field on the cart page.
4. Cron detection + `/api/cron/abandoned-carts` + `abandoned-email.ts`.
5. Cross-device restore hook on the cart page + i18n keys.
6. Full gate + final review + branch finish.
