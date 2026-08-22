# Occasion reminders — design

Date: 2026-08-22
Status: approved for planning

## Problem

Rosette converts one-time gift buyers well but has no mechanism to bring them
back. Gifting is inherently cyclical — birthdays and anniversaries recur — yet
the app stores recipient details inline on each order
(`supabase/migrations/001_commerce.sql:78`), so there is no durable contact and
no way to know a date is approaching.

This feature lets a signed-in customer save a recipient and a date, then emails
them a reminder ahead of it, linking into the collection filtered by occasion.

## Scope

In scope for v1:

- Reusable `recipients` owned by a customer
- Saved `occasions` (annual or one-off) with a per-occasion reminder lead time
- A cron job that sends reminder email, idempotently
- Account UI to add, edit and remove dates
- Suppression when engagement email is off, or when an order already exists for
  that recipient near that date

Explicitly deferred:

- **Checkout capture** of occasions. Agreed as stage 2. v1 does not touch the
  checkout flow, so the value of reminders can be measured before adding a
  field to a tuned funnel.
- **Prefilled gift flow** from the email (stage 3). The email already carries a
  `recipient` query param so this is additive later.
- **Guest occasions.** Occasions require a signed-in customer, which keeps
  `customer_id` non-nullable, reuses existing RLS patterns, and avoids storing
  dates against unverified emails.

## Data model

New migration `supabase/migrations/018_occasion_reminders.sql`, following the
conventions in `012_wishlist.sql`: customer-read RLS only, all writes through
service-role code paths.

### `recipients`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid pk | |
| `customer_id` | uuid not null | → `profiles(id)` on delete cascade |
| `name` | text not null | |
| `phone` | text | optional |
| `city_slug` | text | optional, for future delivery prefill |
| `relationship` | text | free text: `mother`, `wife`, `colleague` |
| `created_at` | timestamptz not null | |

`unique (customer_id, name)` prevents duplicate "Mum" rows.

### `occasions`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid pk | |
| `customer_id` | uuid not null | → `profiles(id)` cascade |
| `recipient_id` | uuid not null | → `recipients(id)` cascade |
| `kind` | text not null | `birthday` / `anniversary` / `graduation` / `other` |
| `recurrence` | text not null | `annual` / `once` |
| `month` | smallint | 1–12, annual only |
| `day` | smallint | 1–31, annual only |
| `event_date` | date | one-off only |
| `lead_days` | smallint not null default 7 | 1–30 |
| `locale` | text not null default `en` | email language |
| `active` | boolean not null default true | soft disable |
| `created_at` | timestamptz not null | |

A check constraint `occasion_shape` enforces the split in the database:

```sql
(recurrence = 'annual' and month is not null and day is not null and event_date is null)
or (recurrence = 'once' and event_date is not null and month is null and day is null)
```

`day` is bounded 1–31 rather than validated per month. Impossible combinations
(Feb 30, Apr 31) are clamped when the cron resolves a concrete date, so a saved
date never silently disappears.

### `occasion_reminders`

Idempotency ledger. One row per occasion per cycle.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid pk | |
| `occasion_id` | uuid not null | → `occasions(id)` cascade |
| `cycle_year` | smallint not null | annual: that year; once: year of `event_date` |
| `sent_at` | timestamptz | null when suppressed |
| `suppressed_reason` | text | `already_ordered` / `engagement_disabled` |
| `converted_order_id` | uuid | → `orders(id)` on delete set null |
| `created_at` | timestamptz not null | |

`unique (occasion_id, cycle_year)` is the idempotency guarantee.

## Cron logic

Route `app/api/cron/occasions/route.ts` mirrors
`app/api/cron/wishlist/route.ts:9`: same `isCronAuthorized` bearer check against
`CRON_SECRET`, same `logger.info('cron.occasions.started')` →
`completed` / `failed` events. Crons are external HTTP calls, not
`wrangler.jsonc` triggers, matching the existing scheduler setup documented in
`docs/setup/runbook.md`.

Logic lives in `features/occasions/occasions-cron.ts` so it is unit-testable
without HTTP.

For each `active` occasion:

1. **Resolve the next occurrence.** `once` uses `event_date`. `annual` uses
   `month`/`day` in the current year, rolling to next year if already past.
2. **Clamp the date.** `clampToMonth(year, month, day)` maps Feb 29 in a
   non-leap year to Feb 28, and day 31 in a 30-day month to the last day.
3. **Compute** `remindOn = nextOccurrence - lead_days`.
4. **Decide.** Send when `remindOn <= today and nextOccurrence >= today`.

   The `<=` is deliberate rather than strict equality. A missed run — deploy,
   outage, scheduler hiccup — would otherwise skip that occasion for a whole
   year. The upper bound prevents emailing about a date already passed.

5. **Claim, then send.** Insert the `occasion_reminders` row first. If the
   unique constraint rejects it, another run already claimed this cycle, so
   skip. Only after a successful claim is email sent, then `sent_at` is set.
   This makes overlapping invocations safe.

6. **Suppress** by writing a ledger row with `suppressed_reason` instead of
   sending:
   - `engagement_disabled` — via `getEngagementPreference`
     (`features/email-preferences/preferences-service.ts:36`)
   - `already_ordered` — a paid order exists whose `recipient_name` matches the
     recipient and whose `delivery_date` is within ±3 days of the occurrence

Returns `{ checked, sent, suppressed, failed }`, matching `WishlistCronSummary`
(`features/wishlist/wishlist-cron.ts:9`) so existing log queries keep working.

### Known limitation

The `already_ordered` check is a heuristic. Orders store `recipient_name` as
free text with no foreign key, so identically-named recipients or a typo will
defeat it. The correct fix is a nullable `orders.recipient_id`, but in v1
checkout has no knowledge of recipients, so the column would always be null.
Stage 2 adds the column and the checkout capture together, at which point
suppression becomes exact.

## Email

`features/occasions/email.ts` mirrors `features/wishlist/email.ts:1` — same
`escapeHtml`, same injectable `MailTransport` via `createMailTransport`, same
`isEmailDeliveryDisabled` guard, same `renderEngagementFooter`.

```ts
renderOccasionEmail(input: {
  locale: 'en' | 'ar' | 'fr';
  recipientName: string;
  occasionKind: string;
  daysUntil: number;
  shopUrl: string;
  unsubscribeUrl?: string;
}): { subject: string; text: string; html: string }
```

Subjects:

| Locale | Subject |
| --- | --- |
| en | `Mum's birthday is in 7 days` |
| ar | `عيد ميلاد Mum بعد ٧ أيام` |
| fr | `L'anniversaire de Mum est dans 7 jours` |

Body is one line of context plus a single rose CTA ("Choose her flowers"), then
the engagement footer. No upsell and no urgency language, consistent with the
design system's ban on marketing clichés.

`daysUntil` is passed in rather than derived inside the template, so
pluralisation and the Arabic dual form stay pure and testable.

The CTA links to `/{locale}/{city}/shop?occasion={kind}&recipient={id}`. The
`recipient` param is inert in v1 — the collection ignores it — and exists so
stage 3 can add prefill without changing the email or invalidating links
already delivered.

Occasion reminder emails are tracked in the `occasion_reminders` ledger
(`sent_at` / `suppressed_reason`), not in `notification_deliveries`; no
retry-queue integration exists or is needed.

## UI

Route `app/[locale]/[city]/account/(dashboard)/occasions/page.tsx`, with a nav
entry in `components/account/AccountShell.tsx` between Wishlist and Email
preferences, using a `CalendarHeart` icon.

Layout follows the established account pattern: sage eyebrow, Fraunces
headline, hairline-separated rows rather than card boxes.

```
Your dates                                    [+ Add a date]
────────────────────────────────────────────────────────────
Mum · mother                              annual · 14 March
birthday                        remind 7 days before   [edit] [×]
```

- Dates render in `.price` mono, matching prices and order numbers
- Recurrence shows as a sage pill (`annual`) or neutral pill (`once`)
- Empty state is a composed block — Fraunces line, one-sentence lede, rose CTA

`features/occasions/OccasionForm.tsx` handles add and edit:

- Recipient: combobox over existing `recipients` with inline "add new"
  (name, optional phone, relationship). Avoids a separate recipients screen.
- Kind: pill radios
- Recurrence: pill radios; `annual` reveals month + day selects, `once` reveals
  a date input. The form mirrors the `occasion_shape` constraint so invalid
  states are unreachable in the UI as well as the database.
- Lead time: `3 / 7 / 14` pills, default 7

Writes go through server actions in `features/occasions/actions.ts`
(`'use server'`), following `features/account/actions.ts`: `getCurrentCustomer()`
guard, Zod validation, then a service-role write. No new API routes, since
occasions are only ever managed by their signed-in owner.

Adds roughly 14 i18n keys across en/ar/fr to `features/i18n/dictionaries.ts`
(`occasionsTitle`, `occasionsEyebrow`, `addDate`, `remindDaysBefore`,
`recurrenceAnnual`, `recurrenceOnce`, `occasionKind_birthday`, …).

## Testing

TDD order by risk — date math first, since it is the highest-risk and
cheapest-to-test part.

| File | Covers |
| --- | --- |
| `tests/domain/occasion-dates.test.ts` | `clampToMonth`, `nextOccurrence` rollover, `once` in the past, `remindOn` arithmetic |
| `tests/domain/occasion-validation.test.ts` | Zod schema mirrors `occasion_shape`; `lead_days` bounds |
| `tests/domain/occasions-cron.test.ts` | Sends when due, skips on existing ledger row, both suppression paths, summary counts, missed-run catch-up |
| `tests/domain/occasion-email.test.ts` | Per-locale subject and body, pluralisation, `escapeHtml`, footer presence |
| `tests/components/OccasionForm.test.tsx` | Recurrence switch swaps fields; submit payload |
| `tests/routes/cron-occasions.test.ts` | 401 without bearer, 200 with |

An injectable `MailTransport` keeps the network out of tests, as with
`sendWishlistEmail`.

## Success criteria

- A saved annual date produces exactly one reminder per year, verified by the
  ledger's unique constraint
- Re-running the cron immediately sends nothing further
- Turning off engagement email suppresses reminders and records the reason
- `npm run lint` and the full test suite stay green
