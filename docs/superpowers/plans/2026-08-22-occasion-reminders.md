# Occasion Reminders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a signed-in customer save recipients and dates, then email them a reminder ahead of each date, linking into the collection filtered by occasion.

**Architecture:** Three new tables (`recipients`, `occasions`, `occasion_reminders`) with customer-read RLS. Pure date math resolves the next occurrence; a cron route claims an idempotency ledger row before sending so overlapping runs cannot double-email. Email and cron mirror the existing wishlist equivalents exactly.

**Tech Stack:** Next.js 16 App Router, TypeScript (strict, `noUncheckedIndexedAccess`), Supabase Postgres, Vitest, Tailwind v4, nodemailer via `createMailTransport`.

**Spec:** `docs/superpowers/specs/2026-08-22-occasion-reminders-design.md`

## Global Constraints

- TypeScript strict mode with `noUncheckedIndexedAccess` — index access yields `T | undefined`, so always guard or use `?.`
- `npm run lint` runs `tsc --noEmit && eslint .` — must exit 0 (warnings allowed, errors not)
- No new npm dependencies. Date math uses built-in `Date`; validation uses the already-installed `zod`
- Cloudflare Workers runtime: no Node-only APIs (`fs`, `path`) in anything imported by app code
- No middleware exists — server actions receive the account base path explicitly (see `features/account/actions.ts:14`)
- All three locales (`en`, `ar`, `fr`) must be populated for every new i18n key
- Cron auth: bearer token compared against `CRON_SECRET` via `isCronAuthorized`
- Structured logs via `logger` from `lib/logger.ts` — never `console.*` directly in app code
- Money/date/ID display uses the `.price` mono class
- Design system: rose `bg-primary`, sage `text-sage`, `border-outline-variant` hairlines, pill radios, skeleton loaders never spinners, no emojis

---

## File Structure

**Create:**

| File | Responsibility |
| --- | --- |
| `supabase/migrations/018_occasion_reminders.sql` | Three tables, constraints, indexes, RLS |
| `features/occasions/occasion-dates.ts` | Pure date math: clamp, next occurrence, remind-on |
| `features/occasions/validation.ts` | Zod schema mirroring the `occasion_shape` DB constraint |
| `features/occasions/email.ts` | Reminder email render + send |
| `features/occasions/occasions-cron.ts` | Cron orchestration, claim-then-send, suppression |
| `features/occasions/repository.ts` | Supabase reads/writes for recipients + occasions |
| `features/occasions/actions.ts` | `'use server'` mutations for the account UI |
| `features/occasions/OccasionForm.tsx` | Add/edit client form |
| `features/occasions/OccasionList.tsx` | Rows + empty state |
| `features/occasions/OccasionsPanel.tsx` | Client wrapper wiring actions to form + list |
| `app/api/cron/occasions/route.ts` | HTTP entry for the cron |
| `app/[locale]/[city]/account/(dashboard)/occasions/page.tsx` | Account page |

**Modify:**

| File | Change |
| --- | --- |
| `components/account/AccountShell.tsx` | Add "Your dates" nav entry |
| `features/i18n/dictionaries.ts` | ~16 keys × 3 locales |
| `features/notifications/notification-delivery.ts` | Add `occasion_reminder` to the type union |

**Test:**

`tests/domain/occasion-dates.test.ts`, `tests/domain/occasion-validation.test.ts`, `tests/domain/occasion-email.test.ts`, `tests/domain/occasions-cron.test.ts`, `tests/routes/cron-occasions.test.ts`, `tests/components/OccasionForm.test.tsx`

---

## Task 1: Migration

**Files:**
- Create: `supabase/migrations/018_occasion_reminders.sql`
- Test: `tests/domain/occasion-migration.test.ts`

**Interfaces:**
- Consumes: existing `public.profiles(id)`, `public.orders(id)`
- Produces: tables `recipients`, `occasions`, `occasion_reminders`

- [ ] **Step 1: Write the failing test**

The migration is SQL, so the test asserts the file's contract rather than executing it — the same approach `tests/components/ThemeTokens.test.ts` uses for CSS.

```ts
// tests/domain/occasion-migration.test.ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync('supabase/migrations/018_occasion_reminders.sql', 'utf8');

describe('018_occasion_reminders migration', () => {
  it('creates the three tables', () => {
    expect(sql).toContain('create table if not exists public.recipients');
    expect(sql).toContain('create table if not exists public.occasions');
    expect(sql).toContain('create table if not exists public.occasion_reminders');
  });

  it('enforces the annual/once shape in the database', () => {
    expect(sql).toContain('constraint occasion_shape');
    expect(sql).toMatch(/recurrence = 'annual'[\s\S]*month is not null/);
    expect(sql).toMatch(/recurrence = 'once'[\s\S]*event_date is not null/);
  });

  it('guarantees one reminder per occasion per cycle', () => {
    expect(sql).toContain('unique (occasion_id, cycle_year)');
  });

  it('dedupes recipients per customer', () => {
    expect(sql).toContain('unique (customer_id, name)');
  });

  it('enables RLS with customer-read policies only', () => {
    expect(sql).toContain('alter table public.recipients enable row level security');
    expect(sql).toContain('alter table public.occasions enable row level security');
    expect(sql).toContain('customer_id = auth.uid()');
    expect(sql).not.toContain('for insert');
  });

  it('cascades from profiles so account deletion cleans up', () => {
    expect(sql).toContain('references public.profiles(id) on delete cascade');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/domain/occasion-migration.test.ts`
Expected: FAIL — `ENOENT: no such file or directory ... 018_occasion_reminders.sql`

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/018_occasion_reminders.sql
-- Occasion reminders. Recipient details currently live inline on orders
-- (001_commerce.sql:78), so there is no reusable contact to remind about.
-- These tables introduce one, plus saved dates and an idempotency ledger.
-- Reads are customer-scoped via RLS; every write goes through service-role
-- code paths, matching the wishlist convention in 012_wishlist.sql.

create table if not exists public.recipients (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  phone text,
  city_slug text,
  relationship text,
  created_at timestamptz not null default now(),
  unique (customer_id, name)
);

create index if not exists recipients_customer_idx on public.recipients(customer_id);

create table if not exists public.occasions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.recipients(id) on delete cascade,
  kind text not null check (kind in ('birthday', 'anniversary', 'graduation', 'other')),
  recurrence text not null check (recurrence in ('annual', 'once')),
  -- annual: month + day set, event_date null. once: event_date set only.
  -- day is bounded 1-31 rather than validated per month; impossible pairs
  -- (Feb 30) are clamped when the cron resolves a concrete date, so a saved
  -- date is never silently dropped.
  month smallint check (month between 1 and 12),
  day smallint check (day between 1 and 31),
  event_date date,
  lead_days smallint not null default 7 check (lead_days between 1 and 30),
  locale text not null default 'en' check (locale in ('en', 'ar', 'fr')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint occasion_shape check (
    (recurrence = 'annual' and month is not null and day is not null and event_date is null)
    or (recurrence = 'once' and event_date is not null and month is null and day is null)
  )
);

create index if not exists occasions_customer_idx on public.occasions(customer_id);
create index if not exists occasions_active_idx on public.occasions(active) where active;

-- One row per occasion per cycle. The cron inserts this BEFORE sending, so the
-- unique constraint is what makes overlapping runs safe.
create table if not exists public.occasion_reminders (
  id uuid primary key default gen_random_uuid(),
  occasion_id uuid not null references public.occasions(id) on delete cascade,
  cycle_year smallint not null,
  sent_at timestamptz,
  suppressed_reason text check (suppressed_reason in ('already_ordered', 'engagement_disabled')),
  converted_order_id uuid references public.orders(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (occasion_id, cycle_year)
);

create index if not exists occasion_reminders_occasion_idx on public.occasion_reminders(occasion_id);

alter table public.recipients enable row level security;
alter table public.occasions enable row level security;
alter table public.occasion_reminders enable row level security;

create policy "customers read own recipients" on public.recipients
  for select using (customer_id = auth.uid());

create policy "customers read own occasions" on public.occasions
  for select using (customer_id = auth.uid());

create policy "customers read own occasion reminders" on public.occasion_reminders
  for select using (
    exists (
      select 1 from public.occasions o
      where o.id = occasion_reminders.occasion_id and o.customer_id = auth.uid()
    )
  );
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/domain/occasion-migration.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/018_occasion_reminders.sql tests/domain/occasion-migration.test.ts
git commit -m "feat: add occasion reminders schema"
```

---

## Task 2: Date math

The highest-risk logic, so it comes first and is pure — no database, no clock injection beyond an explicit `today` argument.

**Files:**
- Create: `features/occasions/occasion-dates.ts`
- Test: `tests/domain/occasion-dates.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `clampToMonth(year: number, month: number, day: number): string` → `YYYY-MM-DD`
  - `type OccasionSchedule = { recurrence: 'annual' | 'once'; month?: number | null; day?: number | null; eventDate?: string | null; leadDays: number }`
  - `nextOccurrence(schedule: OccasionSchedule, today: string): string | null`
  - `remindOnDate(schedule: OccasionSchedule, today: string): string | null`
  - `isReminderDue(schedule: OccasionSchedule, today: string): boolean`
  - `daysUntil(from: string, to: string): number`
  - `cycleYearFor(schedule: OccasionSchedule, today: string): number | null`

- [ ] **Step 1: Write the failing test**

```ts
// tests/domain/occasion-dates.test.ts
import { describe, expect, it } from 'vitest';
import {
  clampToMonth,
  cycleYearFor,
  daysUntil,
  isReminderDue,
  nextOccurrence,
  remindOnDate,
  type OccasionSchedule,
} from '@/features/occasions/occasion-dates';

const annual = (month: number, day: number, leadDays = 7): OccasionSchedule => ({ recurrence: 'annual', month, day, leadDays });
const once = (eventDate: string, leadDays = 7): OccasionSchedule => ({ recurrence: 'once', eventDate, leadDays });

describe('clampToMonth', () => {
  it('keeps valid dates untouched', () => {
    expect(clampToMonth(2026, 3, 14)).toBe('2026-03-14');
  });

  it('clamps Feb 29 to Feb 28 in a non-leap year', () => {
    expect(clampToMonth(2026, 2, 29)).toBe('2026-02-28');
  });

  it('keeps Feb 29 in a leap year', () => {
    expect(clampToMonth(2028, 2, 29)).toBe('2028-02-29');
  });

  it('clamps day 31 in a 30-day month', () => {
    expect(clampToMonth(2026, 4, 31)).toBe('2026-04-30');
  });

  it('zero-pads single digits', () => {
    expect(clampToMonth(2026, 1, 5)).toBe('2026-01-05');
  });
});

describe('nextOccurrence', () => {
  it('returns this year when the annual date is still ahead', () => {
    expect(nextOccurrence(annual(3, 14), '2026-01-01')).toBe('2026-03-14');
  });

  it('returns today when the annual date is today', () => {
    expect(nextOccurrence(annual(3, 14), '2026-03-14')).toBe('2026-03-14');
  });

  it('rolls to next year once the annual date has passed', () => {
    expect(nextOccurrence(annual(3, 14), '2026-03-15')).toBe('2027-03-14');
  });

  it('clamps when rolling into a non-leap year', () => {
    expect(nextOccurrence(annual(2, 29), '2026-06-01')).toBe('2027-02-28');
  });

  it('returns the event date for a one-off', () => {
    expect(nextOccurrence(once('2026-07-12'), '2026-01-01')).toBe('2026-07-12');
  });

  it('returns null for a one-off already in the past', () => {
    expect(nextOccurrence(once('2026-07-12'), '2026-07-13')).toBeNull();
  });

  it('returns null when annual fields are missing', () => {
    expect(nextOccurrence({ recurrence: 'annual', leadDays: 7 }, '2026-01-01')).toBeNull();
  });
});

describe('remindOnDate', () => {
  it('subtracts the lead time', () => {
    expect(remindOnDate(annual(3, 14, 7), '2026-01-01')).toBe('2026-03-07');
  });

  it('crosses a month boundary', () => {
    expect(remindOnDate(annual(3, 3, 7), '2026-01-01')).toBe('2026-02-24');
  });

  it('honours a custom lead time', () => {
    expect(remindOnDate(annual(3, 14, 14), '2026-01-01')).toBe('2026-02-28');
  });
});

describe('isReminderDue', () => {
  it('is false before the remind date', () => {
    expect(isReminderDue(annual(3, 14, 7), '2026-03-06')).toBe(false);
  });

  it('is true on the remind date', () => {
    expect(isReminderDue(annual(3, 14, 7), '2026-03-07')).toBe(true);
  });

  it('stays true after a missed run, up to the occasion itself', () => {
    // A skipped cron run must not lose the whole year.
    expect(isReminderDue(annual(3, 14, 7), '2026-03-10')).toBe(true);
    expect(isReminderDue(annual(3, 14, 7), '2026-03-14')).toBe(true);
  });

  it('is false once the occasion has passed', () => {
    // 2026-03-15 rolls to 2027-03-14, whose remind date is far away.
    expect(isReminderDue(annual(3, 14, 7), '2026-03-15')).toBe(false);
  });

  it('is false for an expired one-off', () => {
    expect(isReminderDue(once('2026-07-12'), '2026-07-13')).toBe(false);
  });
});

describe('daysUntil', () => {
  it('counts whole days forward', () => {
    expect(daysUntil('2026-03-07', '2026-03-14')).toBe(7);
  });

  it('returns zero for the same day', () => {
    expect(daysUntil('2026-03-14', '2026-03-14')).toBe(0);
  });

  it('spans month boundaries', () => {
    expect(daysUntil('2026-02-24', '2026-03-03')).toBe(7);
  });
});

describe('cycleYearFor', () => {
  it('uses the year of the resolved occurrence', () => {
    expect(cycleYearFor(annual(3, 14), '2026-01-01')).toBe(2026);
    expect(cycleYearFor(annual(3, 14), '2026-03-15')).toBe(2027);
  });

  it('returns null when there is no upcoming occurrence', () => {
    expect(cycleYearFor(once('2026-07-12'), '2026-07-13')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/domain/occasion-dates.test.ts`
Expected: FAIL — `Cannot find module '@/features/occasions/occasion-dates'`

- [ ] **Step 3: Write the implementation**

```ts
// features/occasions/occasion-dates.ts
/**
 * Pure date helpers for occasion reminders.
 *
 * Every function takes `today` as an explicit `YYYY-MM-DD` string so the cron
 * stays deterministic and testable without faking the system clock. All dates
 * are treated as calendar dates in UTC — reminders are day-granular, so time
 * zones would only add drift.
 */

export type OccasionSchedule = {
  recurrence: 'annual' | 'once';
  month?: number | null;
  day?: number | null;
  eventDate?: string | null;
  leadDays: number;
};

const DAY_MS = 86_400_000;

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function toUtc(date: string): number {
  const [year, month, day] = date.split('-').map(Number);
  return Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1);
}

function fromUtc(ms: number): string {
  const date = new Date(ms);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** Days in `month` (1-12) of `year`, accounting for leap years. */
function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Resolve a month/day pair to a real date, clamping impossible days.
 * Feb 29 in a non-leap year becomes Feb 28; day 31 in a 30-day month becomes
 * the 30th. Clamping (rather than rejecting) means a saved date never silently
 * stops producing reminders.
 */
export function clampToMonth(year: number, month: number, day: number): string {
  const safeDay = Math.min(day, daysInMonth(year, month));
  return `${year}-${pad(month)}-${pad(safeDay)}`;
}

/** The next date this occasion falls on, or null if it can never occur again. */
export function nextOccurrence(schedule: OccasionSchedule, today: string): string | null {
  if (schedule.recurrence === 'once') {
    if (!schedule.eventDate) return null;
    return toUtc(schedule.eventDate) >= toUtc(today) ? schedule.eventDate : null;
  }
  if (schedule.month == null || schedule.day == null) return null;
  const year = Number(today.slice(0, 4));
  const thisYear = clampToMonth(year, schedule.month, schedule.day);
  if (toUtc(thisYear) >= toUtc(today)) return thisYear;
  return clampToMonth(year + 1, schedule.month, schedule.day);
}

/** The date the reminder should first go out, or null if not applicable. */
export function remindOnDate(schedule: OccasionSchedule, today: string): string | null {
  const occurrence = nextOccurrence(schedule, today);
  if (!occurrence) return null;
  return fromUtc(toUtc(occurrence) - schedule.leadDays * DAY_MS);
}

/**
 * True when a reminder is owed.
 *
 * Uses `remindOn <= today` rather than equality on purpose: a single missed
 * run (deploy, outage, scheduler hiccup) would otherwise skip an annual
 * occasion for a whole year. The upper bound stops us emailing about a date
 * that has already passed.
 */
export function isReminderDue(schedule: OccasionSchedule, today: string): boolean {
  const occurrence = nextOccurrence(schedule, today);
  const remindOn = remindOnDate(schedule, today);
  if (!occurrence || !remindOn) return false;
  const now = toUtc(today);
  return toUtc(remindOn) <= now && toUtc(occurrence) >= now;
}

/** Whole days between two calendar dates. */
export function daysUntil(from: string, to: string): number {
  return Math.round((toUtc(to) - toUtc(from)) / DAY_MS);
}

/** Ledger key: the year of the upcoming occurrence. */
export function cycleYearFor(schedule: OccasionSchedule, today: string): number | null {
  const occurrence = nextOccurrence(schedule, today);
  return occurrence ? Number(occurrence.slice(0, 4)) : null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/domain/occasion-dates.test.ts`
Expected: PASS (24 tests)

- [ ] **Step 5: Typecheck and commit**

```bash
npm run lint
git add features/occasions/occasion-dates.ts tests/domain/occasion-dates.test.ts
git commit -m "feat: add occasion date math"
```

---

## Task 3: Validation

**Files:**
- Create: `features/occasions/validation.ts`
- Test: `tests/domain/occasion-validation.test.ts`

**Interfaces:**
- Consumes: `zod` (already installed)
- Produces:
  - `occasionInputSchema` (zod schema)
  - `type OccasionInput = z.infer<typeof occasionInputSchema>`
  - `validateOccasion(input: unknown): { ok: true; value: OccasionInput } | { ok: false; error: string }`
  - `OCCASION_KINDS: readonly ['birthday','anniversary','graduation','other']`
  - `LEAD_DAY_CHOICES: readonly [3, 7, 14]`

- [ ] **Step 1: Write the failing test**

```ts
// tests/domain/occasion-validation.test.ts
import { describe, expect, it } from 'vitest';
import { LEAD_DAY_CHOICES, OCCASION_KINDS, validateOccasion } from '@/features/occasions/validation';

const annual = { recipientName: 'Mum', kind: 'birthday', recurrence: 'annual', month: 3, day: 14, leadDays: 7, locale: 'en' };
const once = { recipientName: 'Youssef', kind: 'graduation', recurrence: 'once', eventDate: '2026-07-12', leadDays: 14, locale: 'en' };

describe('validateOccasion', () => {
  it('accepts a well-formed annual occasion', () => {
    const result = validateOccasion(annual);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.month).toBe(3);
  });

  it('accepts a well-formed one-off occasion', () => {
    const result = validateOccasion(once);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.eventDate).toBe('2026-07-12');
  });

  it('rejects an annual occasion missing month or day', () => {
    expect(validateOccasion({ ...annual, month: undefined }).ok).toBe(false);
    expect(validateOccasion({ ...annual, day: undefined }).ok).toBe(false);
  });

  it('rejects a one-off occasion without a date', () => {
    expect(validateOccasion({ ...once, eventDate: undefined }).ok).toBe(false);
  });

  it('rejects an annual occasion that also carries an event date', () => {
    // Mirrors the occasion_shape DB constraint: the two forms are exclusive.
    expect(validateOccasion({ ...annual, eventDate: '2026-03-14' }).ok).toBe(false);
  });

  it('rejects a one-off occasion that also carries month/day', () => {
    expect(validateOccasion({ ...once, month: 7, day: 12 }).ok).toBe(false);
  });

  it('rejects an empty recipient name', () => {
    expect(validateOccasion({ ...annual, recipientName: '   ' }).ok).toBe(false);
  });

  it('trims the recipient name', () => {
    const result = validateOccasion({ ...annual, recipientName: '  Mum  ' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.recipientName).toBe('Mum');
  });

  it('rejects an unknown kind', () => {
    expect(validateOccasion({ ...annual, kind: 'wedding' }).ok).toBe(false);
  });

  it('rejects out-of-range months and days', () => {
    expect(validateOccasion({ ...annual, month: 13 }).ok).toBe(false);
    expect(validateOccasion({ ...annual, month: 0 }).ok).toBe(false);
    expect(validateOccasion({ ...annual, day: 32 }).ok).toBe(false);
    expect(validateOccasion({ ...annual, day: 0 }).ok).toBe(false);
  });

  it('rejects lead days outside 1-30', () => {
    expect(validateOccasion({ ...annual, leadDays: 0 }).ok).toBe(false);
    expect(validateOccasion({ ...annual, leadDays: 31 }).ok).toBe(false);
  });

  it('rejects a malformed event date', () => {
    expect(validateOccasion({ ...once, eventDate: '12/07/2026' }).ok).toBe(false);
  });

  it('rejects an unsupported locale', () => {
    expect(validateOccasion({ ...annual, locale: 'de' }).ok).toBe(false);
  });

  it('exposes the kind and lead-day choices for the UI', () => {
    expect(OCCASION_KINDS).toContain('birthday');
    expect(LEAD_DAY_CHOICES).toEqual([3, 7, 14]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/domain/occasion-validation.test.ts`
Expected: FAIL — `Cannot find module '@/features/occasions/validation'`

- [ ] **Step 3: Write the implementation**

```ts
// features/occasions/validation.ts
import { z } from 'zod';

export const OCCASION_KINDS = ['birthday', 'anniversary', 'graduation', 'other'] as const;
export const LEAD_DAY_CHOICES = [3, 7, 14] as const;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Mirrors the `occasion_shape` check constraint in
 * supabase/migrations/018_occasion_reminders.sql so an invalid combination is
 * unreachable from the UI as well as the database.
 */
export const occasionInputSchema = z
  .object({
    recipientName: z.string().trim().min(1).max(120),
    recipientPhone: z.string().trim().max(50).optional(),
    relationship: z.string().trim().max(60).optional(),
    kind: z.enum(OCCASION_KINDS),
    recurrence: z.enum(['annual', 'once']),
    month: z.number().int().min(1).max(12).optional(),
    day: z.number().int().min(1).max(31).optional(),
    eventDate: z.string().regex(ISO_DATE).optional(),
    leadDays: z.number().int().min(1).max(30),
    locale: z.enum(['en', 'ar', 'fr']),
  })
  .refine(
    (value) =>
      value.recurrence === 'annual'
        ? value.month != null && value.day != null && value.eventDate == null
        : value.eventDate != null && value.month == null && value.day == null,
    { message: 'annual occasions need month and day; one-off occasions need an event date' },
  );

export type OccasionInput = z.infer<typeof occasionInputSchema>;

export function validateOccasion(input: unknown): { ok: true; value: OccasionInput } | { ok: false; error: string } {
  const parsed = occasionInputSchema.safeParse(input);
  if (parsed.success) return { ok: true, value: parsed.data };
  return { ok: false, error: parsed.error.issues[0]?.message ?? 'invalid input' };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/domain/occasion-validation.test.ts`
Expected: PASS (14 tests)

- [ ] **Step 5: Typecheck and commit**

```bash
npm run lint
git add features/occasions/validation.ts tests/domain/occasion-validation.test.ts
git commit -m "feat: add occasion input validation"
```

---

## Task 4: Reminder email

**Files:**
- Create: `features/occasions/email.ts`
- Modify: `features/notifications/notification-delivery.ts`
- Test: `tests/domain/occasion-email.test.ts`

**Interfaces:**
- Consumes: `escapeHtml` (`features/notifications/email-templates.ts:3`), `createMailTransport` + `type MailTransport` (`features/notifications/gmail-mailer.ts:5`), `isEmailDeliveryDisabled` (`lib/runtime-config.ts:28`), `renderEngagementFooter(locale, unsubscribeUrl)` (`features/email-preferences/engagement-footer.ts:10`)
- Produces:
  - `type OccasionEmailInput = { locale: 'en'|'ar'|'fr'; recipientName: string; occasionKind: string; daysUntil: number; shopUrl: string; unsubscribeUrl?: string }`
  - `renderOccasionEmail(input: OccasionEmailInput): { subject: string; text: string; html: string }`
  - `sendOccasionEmail(input: OccasionEmailInput & { to: string }, injectedTransport?: MailTransport): Promise<void>`

- [ ] **Step 1: Write the failing test**

```ts
// tests/domain/occasion-email.test.ts
import { describe, expect, it, vi } from 'vitest';
import { renderOccasionEmail, sendOccasionEmail } from '@/features/occasions/email';

const base = {
  recipientName: 'Mum',
  occasionKind: 'birthday',
  daysUntil: 7,
  shopUrl: 'https://rosette.test/en/cairo/shop?occasion=birthday&recipient=r1',
} as const;

describe('renderOccasionEmail', () => {
  it('names the recipient and the countdown in the English subject', () => {
    const { subject } = renderOccasionEmail({ ...base, locale: 'en' });
    expect(subject).toContain('Mum');
    expect(subject).toContain('7 days');
  });

  it('uses the singular form for one day', () => {
    const { subject } = renderOccasionEmail({ ...base, daysUntil: 1, locale: 'en' });
    expect(subject).toContain('1 day');
    expect(subject).not.toContain('1 days');
  });

  it('renders an Arabic subject', () => {
    const { subject } = renderOccasionEmail({ ...base, locale: 'ar' });
    expect(subject).toMatch(/[\u0600-\u06FF]/);
    expect(subject).toContain('Mum');
  });

  it('renders a French subject', () => {
    const { subject } = renderOccasionEmail({ ...base, locale: 'fr' });
    expect(subject).toContain('Mum');
    expect(subject).toContain('7 jours');
  });

  it('links to the filtered collection', () => {
    const { html, text } = renderOccasionEmail({ ...base, locale: 'en' });
    expect(html).toContain('occasion=birthday');
    expect(text).toContain('occasion=birthday');
  });

  it('escapes HTML in the recipient name', () => {
    const { html } = renderOccasionEmail({ ...base, recipientName: '<script>x</script>', locale: 'en' });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('includes the engagement footer when an unsubscribe url is supplied', () => {
    const withFooter = renderOccasionEmail({ ...base, locale: 'en', unsubscribeUrl: 'https://rosette.test/unsub?t=1' });
    const without = renderOccasionEmail({ ...base, locale: 'en' });
    expect(withFooter.html.length).toBeGreaterThan(without.html.length);
    expect(withFooter.html).toContain('unsub');
  });

  it('sets the html lang attribute per locale', () => {
    expect(renderOccasionEmail({ ...base, locale: 'ar' }).html).toContain('lang="ar"');
  });
});

describe('sendOccasionEmail', () => {
  it('sends through the injected transport', async () => {
    const sendMail = vi.fn().mockResolvedValue(undefined);
    await sendOccasionEmail({ ...base, locale: 'en', to: 'nour@example.com' }, { sendMail });
    expect(sendMail).toHaveBeenCalledTimes(1);
    const message = sendMail.mock.calls[0]![0] as { to: string; subject: string };
    expect(message.to).toBe('nour@example.com');
    expect(message.subject).toContain('Mum');
  });

  it('adds one-click unsubscribe headers when available', async () => {
    const sendMail = vi.fn().mockResolvedValue(undefined);
    await sendOccasionEmail(
      { ...base, locale: 'en', to: 'nour@example.com', unsubscribeUrl: 'https://rosette.test/unsub?t=1' },
      { sendMail },
    );
    const message = sendMail.mock.calls[0]![0] as { headers?: Record<string, string> };
    expect(message.headers?.['List-Unsubscribe']).toContain('https://rosette.test/unsub?t=1');
    expect(message.headers?.['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/domain/occasion-email.test.ts`
Expected: FAIL — `Cannot find module '@/features/occasions/email'`

- [ ] **Step 3: Write the implementation**

```ts
// features/occasions/email.ts
import { escapeHtml } from '@/features/notifications/email-templates';
import { createMailTransport, type MailTransport } from '@/features/notifications/gmail-mailer';
import { isEmailDeliveryDisabled } from '@/lib/runtime-config';
import { renderEngagementFooter } from '@/features/email-preferences/engagement-footer';
import type { PreferenceLocale } from '@/features/email-preferences/preferences-service';

type EmailLocale = 'en' | 'ar' | 'fr';

export type OccasionEmailInput = {
  locale: EmailLocale;
  recipientName: string;
  occasionKind: string;
  daysUntil: number;
  shopUrl: string;
  unsubscribeUrl?: string;
};

const kindLabels: Record<EmailLocale, Record<string, string>> = {
  en: { birthday: 'birthday', anniversary: 'anniversary', graduation: 'graduation', other: 'special day' },
  ar: { birthday: 'عيد ميلاد', anniversary: 'ذكرى', graduation: 'تخرج', other: 'يوم خاص' },
  fr: { birthday: 'anniversaire', anniversary: 'anniversaire de mariage', graduation: 'remise de diplôme', other: 'jour spécial' },
};

/** `daysUntil` arrives pre-computed so pluralisation stays a pure function. */
function countdown(locale: EmailLocale, days: number): string {
  if (locale === 'ar') return days === 1 ? 'غداً' : days === 2 ? 'بعد يومين' : `بعد ${days} أيام`;
  if (locale === 'fr') return days === 1 ? 'dans 1 jour' : `dans ${days} jours`;
  return days === 1 ? 'in 1 day' : `in ${days} days`;
}

function subjectFor(input: OccasionEmailInput): string {
  const kind = kindLabels[input.locale][input.occasionKind] ?? kindLabels[input.locale].other!;
  const when = countdown(input.locale, input.daysUntil);
  if (input.locale === 'ar') return `${kind} ${input.recipientName} ${when}`;
  if (input.locale === 'fr') return `L'${kind} de ${input.recipientName} est ${when}`;
  return `${input.recipientName}'s ${kind} is ${when}`;
}

const cta: Record<EmailLocale, string> = {
  en: 'Choose their flowers',
  ar: 'اختر الزهور',
  fr: 'Choisissez ses fleurs',
};

const lede: Record<EmailLocale, string> = {
  en: 'A little notice, so the day is not a surprise to you.',
  ar: 'تنبيه صغير، حتى لا يكون اليوم مفاجأة لك.',
  fr: 'Un petit rappel, pour que le jour ne vous surprenne pas.',
};

export function renderOccasionEmail(input: OccasionEmailInput): { subject: string; text: string; html: string } {
  const subject = subjectFor(input);
  const url = escapeHtml(input.shopUrl);
  const footer = input.unsubscribeUrl
    ? renderEngagementFooter(input.locale as PreferenceLocale, input.unsubscribeUrl)
    : { text: '', html: '' };
  const text = `${subject}\n${lede[input.locale]}\n${input.shopUrl}${footer.text}`;
  const html = `<!doctype html><html lang="${input.locale}"><body style="font-family:Arial,sans-serif"><h1>${escapeHtml(subject)}</h1><p>${escapeHtml(lede[input.locale])}</p><p><a href="${url}">${escapeHtml(cta[input.locale])}</a></p>${footer.html}</body></html>`;
  return { subject, text, html };
}

export async function sendOccasionEmail(
  input: OccasionEmailInput & { to: string },
  injectedTransport?: MailTransport,
): Promise<void> {
  if (!injectedTransport && isEmailDeliveryDisabled()) throw new Error('Email delivery disabled');
  const transport = injectedTransport ?? createMailTransport();
  const { subject, text, html } = renderOccasionEmail(input);
  await transport.sendMail({
    from: 'Rosette <rosette-occasions@localhost>',
    to: input.to,
    subject,
    text,
    html,
    ...(input.unsubscribeUrl
      ? {
        headers: {
          'List-Unsubscribe': `<${input.unsubscribeUrl}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      }
      : {}),
  });
}
```

- [ ] **Step 4: Register the notification type**

In `features/notifications/notification-delivery.ts`, find the notification type union and add `'occasion_reminder'` so failures land in the existing retry queue and admin notifications view. Read the file first — add the member to the existing union rather than creating a new type.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/domain/occasion-email.test.ts tests/domain/notification-delivery.test.ts`
Expected: PASS — 10 new tests, and the existing delivery tests still green

- [ ] **Step 6: Typecheck and commit**

```bash
npm run lint
git add features/occasions/email.ts features/notifications/notification-delivery.ts tests/domain/occasion-email.test.ts
git commit -m "feat: add occasion reminder email"
```

---

## Task 5: Cron orchestration

**Files:**
- Create: `features/occasions/occasions-cron.ts`
- Test: `tests/domain/occasions-cron.test.ts`

**Interfaces:**
- Consumes: `isReminderDue`, `nextOccurrence`, `cycleYearFor`, `daysUntil` (Task 2); `sendOccasionEmail` (Task 4); `getEngagementPreference` + `buildUnsubscribeUrl` (`features/email-preferences/preferences-service.ts:60`)
- Produces:
  - `type OccasionCronSummary = { checked: number; sent: number; failed: number; suppressed: number }`
  - `runOccasionCron(client, deps): Promise<OccasionCronSummary>` where `deps = { origin: string; today?: string; send?: typeof sendOccasionEmail; secret?: string; getPreference?: (email: string) => Promise<EngagementPreference> }`

The summary shape deliberately matches `WishlistCronSummary` (`features/wishlist/wishlist-cron.ts:9`) so existing log queries keep working.

- [ ] **Step 1: Write the failing test**

Uses a hand-rolled fake Supabase client, matching `tests/domain/wishlist-cron.test.ts`.

```ts
// tests/domain/occasions-cron.test.ts
import { describe, expect, it, vi } from 'vitest';
import { runOccasionCron } from '@/features/occasions/occasions-cron';

type Row = Record<string, any>;

function fakeClient(options: { occasions: Row[]; reminders?: Row[]; orders?: Row[] }) {
  const reminders: Row[] = [...(options.reminders ?? [])];
  const orders: Row[] = options.orders ?? [];

  const builder = (table: string) => {
    if (table === 'occasions') {
      return { select: () => Promise.resolve({ data: options.occasions, error: null }) };
    }
    if (table === 'orders') {
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        gte: () => chain,
        lte: () => chain,
        then: (resolve: (value: { data: Row[]; error: null }) => unknown) => resolve({ data: orders, error: null }),
      };
      return chain;
    }
    if (table === 'occasion_reminders') {
      return {
        insert: (row: Row) => {
          const clash = reminders.some((r) => r.occasion_id === row.occasion_id && r.cycle_year === row.cycle_year);
          if (clash) {
            return { select: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: { message: 'duplicate key' } }) }) };
          }
          reminders.push({ ...row, id: `rem-${reminders.length + 1}` });
          const created = reminders[reminders.length - 1];
          return { select: () => ({ maybeSingle: () => Promise.resolve({ data: created, error: null }) }) };
        },
        update: (patch: Row) => ({
          eq: (_col: string, value: string) => {
            const target = reminders.find((r) => r.id === value);
            if (target) Object.assign(target, patch);
            return Promise.resolve({ error: null });
          },
        }),
      };
    }
    throw new Error(`unexpected table ${table}`);
  };

  return { client: { from: builder }, reminders };
}

const annualOccasion = (overrides: Row = {}): Row => ({
  id: 'occ-1',
  customer_id: 'cust-1',
  recipient_id: 'rec-1',
  kind: 'birthday',
  recurrence: 'annual',
  month: 3,
  day: 14,
  event_date: null,
  lead_days: 7,
  locale: 'en',
  active: true,
  recipients: { id: 'rec-1', name: 'Mum' },
  profiles: { email: 'nour@example.com' },
  ...overrides,
});

const enabled = () => Promise.resolve({ status: 'enabled' as const });

describe('runOccasionCron', () => {
  it('sends a reminder when one is due', async () => {
    const { client, reminders } = fakeClient({ occasions: [annualOccasion()] });
    const send = vi.fn().mockResolvedValue(undefined);
    const summary = await runOccasionCron(client, { origin: 'https://rosette.test', today: '2026-03-07', send, secret: 's', getPreference: enabled });

    expect(summary).toEqual({ checked: 1, sent: 1, failed: 0, suppressed: 0 });
    const payload = send.mock.calls[0]![0] as Record<string, any>;
    expect(payload.to).toBe('nour@example.com');
    expect(payload.recipientName).toBe('Mum');
    expect(payload.daysUntil).toBe(7);
    expect(payload.shopUrl).toContain('occasion=birthday');
    expect(reminders[0]!.cycle_year).toBe(2026);
  });

  it('sends nothing before the reminder date', async () => {
    const { client } = fakeClient({ occasions: [annualOccasion()] });
    const send = vi.fn();
    const summary = await runOccasionCron(client, { origin: 'https://rosette.test', today: '2026-03-01', send, secret: 's', getPreference: enabled });
    expect(summary).toEqual({ checked: 1, sent: 0, failed: 0, suppressed: 0 });
    expect(send).not.toHaveBeenCalled();
  });

  it('is idempotent: a claimed cycle is skipped', async () => {
    const { client } = fakeClient({
      occasions: [annualOccasion()],
      reminders: [{ id: 'rem-existing', occasion_id: 'occ-1', cycle_year: 2026, sent_at: '2026-03-07T09:00:00Z' }],
    });
    const send = vi.fn();
    const summary = await runOccasionCron(client, { origin: 'https://rosette.test', today: '2026-03-08', send, secret: 's', getPreference: enabled });
    expect(send).not.toHaveBeenCalled();
    expect(summary.sent).toBe(0);
  });

  it('still sends after a missed run, up to the occasion date', async () => {
    const { client } = fakeClient({ occasions: [annualOccasion()] });
    const send = vi.fn().mockResolvedValue(undefined);
    const summary = await runOccasionCron(client, { origin: 'https://rosette.test', today: '2026-03-11', send, secret: 's', getPreference: enabled });
    expect(summary.sent).toBe(1);
    expect((send.mock.calls[0]![0] as Record<string, any>).daysUntil).toBe(3);
  });

  it('suppresses when engagement email is disabled', async () => {
    const { client, reminders } = fakeClient({ occasions: [annualOccasion()] });
    const send = vi.fn();
    const summary = await runOccasionCron(client, {
      origin: 'https://rosette.test',
      today: '2026-03-07',
      send,
      secret: 's',
      getPreference: () => Promise.resolve({ status: 'disabled' as const }),
    });
    expect(send).not.toHaveBeenCalled();
    expect(summary.suppressed).toBe(1);
    expect(reminders[0]!.suppressed_reason).toBe('engagement_disabled');
  });

  it('suppresses when a paid order already covers the occasion', async () => {
    const { client, reminders } = fakeClient({
      occasions: [annualOccasion()],
      orders: [{ id: 'ord-1', recipient_name: 'Mum', delivery_date: '2026-03-14', payment_status: 'paid' }],
    });
    const send = vi.fn();
    const summary = await runOccasionCron(client, { origin: 'https://rosette.test', today: '2026-03-07', send, secret: 's', getPreference: enabled });
    expect(send).not.toHaveBeenCalled();
    expect(summary.suppressed).toBe(1);
    expect(reminders[0]!.suppressed_reason).toBe('already_ordered');
    expect(reminders[0]!.converted_order_id).toBe('ord-1');
  });

  it('counts a send failure without aborting the run', async () => {
    const { client } = fakeClient({ occasions: [annualOccasion(), annualOccasion({ id: 'occ-2' })] });
    const send = vi.fn().mockRejectedValueOnce(new Error('smtp down')).mockResolvedValueOnce(undefined);
    const summary = await runOccasionCron(client, { origin: 'https://rosette.test', today: '2026-03-07', send, secret: 's', getPreference: enabled });
    expect(summary.checked).toBe(2);
    expect(summary.failed).toBe(1);
    expect(summary.sent).toBe(1);
  });

  it('counts a preference lookup error as failed, not sent', async () => {
    const { client } = fakeClient({ occasions: [annualOccasion()] });
    const send = vi.fn();
    const summary = await runOccasionCron(client, {
      origin: 'https://rosette.test',
      today: '2026-03-07',
      send,
      secret: 's',
      getPreference: () => Promise.resolve({ status: 'error' as const }),
    });
    expect(send).not.toHaveBeenCalled();
    expect(summary.failed).toBe(1);
  });

  it('skips an occasion with no email on file', async () => {
    const { client } = fakeClient({ occasions: [annualOccasion({ profiles: { email: null } })] });
    const send = vi.fn();
    const summary = await runOccasionCron(client, { origin: 'https://rosette.test', today: '2026-03-07', send, secret: 's', getPreference: enabled });
    expect(send).not.toHaveBeenCalled();
    expect(summary.failed).toBe(1);
  });

  it('ignores an expired one-off occasion', async () => {
    const { client } = fakeClient({
      occasions: [annualOccasion({ recurrence: 'once', month: null, day: null, event_date: '2026-01-05' })],
    });
    const send = vi.fn();
    const summary = await runOccasionCron(client, { origin: 'https://rosette.test', today: '2026-03-07', send, secret: 's', getPreference: enabled });
    expect(send).not.toHaveBeenCalled();
    expect(summary.sent).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/domain/occasions-cron.test.ts`
Expected: FAIL — `Cannot find module '@/features/occasions/occasions-cron'`

- [ ] **Step 3: Write the implementation**

```ts
// features/occasions/occasions-cron.ts
import { getRequiredServerEnv } from '@/lib/server-env';
import { buildUnsubscribeUrl, getEngagementPreference, type EngagementPreference } from '@/features/email-preferences/preferences-service';
import { cycleYearFor, daysUntil, isReminderDue, nextOccurrence, type OccasionSchedule } from './occasion-dates';
import { sendOccasionEmail } from './email';

type CronClient = { from: (table: string) => any };
type PreferenceLookup = (email: string) => Promise<EngagementPreference>;

export type OccasionCronSummary = { checked: number; sent: number; failed: number; suppressed: number };

const select = 'id,customer_id,recipient_id,kind,recurrence,month,day,event_date,lead_days,locale,active,recipients(id,name),profiles(email)';

/** Today as YYYY-MM-DD in UTC. Reminders are day-granular. */
function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function shiftDays(date: string, delta: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + delta * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Heuristic suppression: orders store recipient_name as free text with no
 * foreign key (001_commerce.sql:78), so an identically-named recipient or a
 * typo defeats it. Stage 2 adds orders.recipient_id with checkout capture, at
 * which point this becomes exact.
 */
async function findCoveringOrder(client: CronClient, customerId: string, recipientName: string, occurrence: string): Promise<string | null> {
  const { data } = await client
    .from('orders')
    .select('id,recipient_name,delivery_date,payment_status')
    .eq('customer_id', customerId)
    .eq('payment_status', 'paid')
    .gte('delivery_date', shiftDays(occurrence, -3))
    .lte('delivery_date', shiftDays(occurrence, 3));
  const rows = (data ?? []) as Array<{ id: string; recipient_name?: string | null }>;
  const wanted = recipientName.trim().toLowerCase();
  const hit = rows.find((row) => (row.recipient_name ?? '').trim().toLowerCase() === wanted);
  return hit ? hit.id : null;
}

export async function runOccasionCron(
  client: CronClient,
  deps: { origin: string; today?: string; send?: typeof sendOccasionEmail; secret?: string; getPreference?: PreferenceLookup },
): Promise<OccasionCronSummary> {
  const today = deps.today ?? todayUtc();
  const send = deps.send ?? sendOccasionEmail;
  const secret = deps.secret ?? getRequiredServerEnv('EMAIL_PREFERENCES_SECRET');
  const getPreference = deps.getPreference ?? ((email: string) => getEngagementPreference(client, email));
  const summary: OccasionCronSummary = { checked: 0, sent: 0, failed: 0, suppressed: 0 };

  const { data } = await client.from('occasions').select(select);
  const rows = (data ?? []) as Array<Record<string, any>>;

  for (const row of rows) {
    if (row.active === false) continue;
    const schedule: OccasionSchedule = {
      recurrence: row.recurrence === 'once' ? 'once' : 'annual',
      month: row.month == null ? null : Number(row.month),
      day: row.day == null ? null : Number(row.day),
      eventDate: row.event_date ?? null,
      leadDays: Number(row.lead_days ?? 7),
    };

    summary.checked += 1;
    if (!isReminderDue(schedule, today)) continue;

    const occurrence = nextOccurrence(schedule, today);
    const cycleYear = cycleYearFor(schedule, today);
    if (!occurrence || cycleYear == null) continue;

    const recipient = row.recipients as { id?: string; name?: string } | null;
    const email = (row.profiles as { email?: string | null } | null)?.email;
    if (!recipient?.name || !email) { summary.failed += 1; continue; }

    // Claim the cycle BEFORE sending. A unique-constraint rejection means
    // another run already owns it, so overlapping invocations cannot double-send.
    const claimed = await client
      .from('occasion_reminders')
      .insert({ occasion_id: String(row.id), cycle_year: cycleYear })
      .select('id')
      .maybeSingle();
    if (claimed?.error || !claimed?.data?.id) continue;
    const reminderId = String(claimed.data.id);

    let preference: EngagementPreference;
    try {
      preference = await getPreference(email);
    } catch {
      preference = { status: 'error' };
    }
    if (preference.status === 'error') { summary.failed += 1; continue; }
    if (preference.status === 'disabled') {
      await client.from('occasion_reminders').update({ suppressed_reason: 'engagement_disabled' }).eq('id', reminderId);
      summary.suppressed += 1;
      continue;
    }

    const coveringOrderId = await findCoveringOrder(client, String(row.customer_id), recipient.name, occurrence);
    if (coveringOrderId) {
      await client.from('occasion_reminders')
        .update({ suppressed_reason: 'already_ordered', converted_order_id: coveringOrderId })
        .eq('id', reminderId);
      summary.suppressed += 1;
      continue;
    }

    const locale = row.locale === 'ar' || row.locale === 'fr' ? row.locale : 'en';
    const origin = deps.origin.replace(/\/$/, '');
    const shopUrl = `${origin}/${locale}/cairo/shop?occasion=${encodeURIComponent(String(row.kind))}&recipient=${encodeURIComponent(String(recipient.id ?? ''))}`;

    try {
      await send({
        to: email,
        locale,
        recipientName: recipient.name,
        occasionKind: String(row.kind),
        daysUntil: daysUntil(today, occurrence),
        shopUrl,
        unsubscribeUrl: buildUnsubscribeUrl(origin, email, secret, locale),
      });
      await client.from('occasion_reminders').update({ sent_at: new Date().toISOString() }).eq('id', reminderId);
      summary.sent += 1;
    } catch {
      summary.failed += 1;
    }
  }

  return summary;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/domain/occasions-cron.test.ts`
Expected: PASS (10 tests)

- [ ] **Step 5: Typecheck and commit**

```bash
npm run lint
git add features/occasions/occasions-cron.ts tests/domain/occasions-cron.test.ts
git commit -m "feat: add occasion reminder cron logic"
```

---

## Task 6: Cron route

**Files:**
- Create: `app/api/cron/occasions/route.ts`
- Test: `tests/routes/cron-occasions.test.ts`

**Interfaces:**
- Consumes: `runOccasionCron` (Task 5); `isCronAuthorized` (`lib/cron.ts`); `getAdminSupabase`; `getPublicOrigin`; `logger`
- Produces: `GET` and `POST` handlers returning `{ ok: true, summary }`

- [ ] **Step 1: Write the failing test**

```ts
// tests/routes/cron-occasions.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/admin', () => ({
  getAdminSupabase: () => ({ from: () => ({ select: () => Promise.resolve({ data: [], error: null }) }) }),
}));
vi.mock('@/lib/server-env', () => ({
  getRequiredServerEnv: (key: string) => (key === 'CRON_SECRET' ? 'test-secret' : 'other'),
  getOptionalServerEnv: () => undefined,
}));
vi.mock('@/features/occasions/occasions-cron', () => ({
  runOccasionCron: vi.fn().mockResolvedValue({ checked: 3, sent: 1, failed: 0, suppressed: 2 }),
}));

const { GET, POST } = await import('@/app/api/cron/occasions/route');

function request(auth?: string): Request {
  return new Request('https://rosette.test/api/cron/occasions', {
    method: 'POST',
    ...(auth ? { headers: { authorization: auth } } : {}),
  });
}

beforeEach(() => vi.clearAllMocks());

describe('POST /api/cron/occasions', () => {
  it('rejects a request with no bearer token', async () => {
    expect((await POST(request())).status).toBe(401);
  });

  it('rejects a wrong bearer token', async () => {
    expect((await POST(request('Bearer nope'))).status).toBe(401);
  });

  it('runs the cron and returns the summary', async () => {
    const res = await POST(request('Bearer test-secret'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, summary: { checked: 3, sent: 1, failed: 0, suppressed: 2 } });
  });

  it('exposes GET for schedulers that cannot POST', async () => {
    expect((await GET(request('Bearer test-secret'))).status).toBe(200);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/routes/cron-occasions.test.ts`
Expected: FAIL — cannot resolve `@/app/api/cron/occasions/route`

- [ ] **Step 3: Write the implementation**

```ts
// app/api/cron/occasions/route.ts
import { NextResponse } from 'next/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getRequiredServerEnv } from '@/lib/server-env';
import { getPublicOrigin } from '@/lib/origin';
import { logRouteError } from '@/lib/api';
import { logger } from '@/lib/logger';
import { isCronAuthorized } from '@/lib/cron';
import { runOccasionCron } from '@/features/occasions/occasions-cron';

async function handle(request: Request) {
  try {
    if (!isCronAuthorized(request.headers.get('authorization'), getRequiredServerEnv('CRON_SECRET'))) {
      logger.warn('cron.occasions.unauthorized');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    logger.info('cron.occasions.started');
    const summary = await runOccasionCron(getAdminSupabase(), {
      origin: getPublicOrigin(request),
      secret: getRequiredServerEnv('EMAIL_PREFERENCES_SECRET'),
    });
    logger.info('cron.occasions.completed', { summary });
    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    logRouteError('occasion reminders', error);
    logger.error('cron.occasions.failed', { error });
    return NextResponse.json({ error: 'Occasion job failed' }, { status: 503 });
  }
}

export async function GET(request: Request) { return handle(request); }
export async function POST(request: Request) { return handle(request); }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/routes/cron-occasions.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Typecheck and commit**

```bash
npm run lint
git add app/api/cron/occasions/route.ts tests/routes/cron-occasions.test.ts
git commit -m "feat: add occasion reminder cron endpoint"
```

---

## Task 7: Repository

**Files:**
- Create: `features/occasions/repository.ts`
- Test: `tests/domain/occasion-repository.test.ts`

**Interfaces:**
- Consumes: nothing beyond a `{ from }` client
- Produces:
  - `type OccasionRow = { id: string; recipientId: string; recipientName: string; relationship: string | null; kind: string; recurrence: 'annual' | 'once'; month: number | null; day: number | null; eventDate: string | null; leadDays: number; active: boolean }`
  - `listOccasions(client, customerId): Promise<OccasionRow[]>`
  - `listRecipients(client, customerId): Promise<Array<{ id: string; name: string; relationship: string | null }>>`
  - `upsertRecipient(client, customerId, input): Promise<string | null>` → recipient id
  - `insertOccasion(client, customerId, recipientId, input): Promise<'saved' | 'failure'>`
  - `updateOccasion(client, customerId, occasionId, input): Promise<'saved' | 'failure'>`
  - `deleteOccasion(client, customerId, occasionId): Promise<'deleted' | 'failure'>`

- [ ] **Step 1: Write the failing test**

```ts
// tests/domain/occasion-repository.test.ts
import { describe, expect, it, vi } from 'vitest';
import { deleteOccasion, insertOccasion, listOccasions, upsertRecipient } from '@/features/occasions/repository';

const validInput = {
  recipientName: 'Mum',
  kind: 'birthday' as const,
  recurrence: 'annual' as const,
  month: 3,
  day: 14,
  leadDays: 7,
  locale: 'en' as const,
};

describe('listOccasions', () => {
  it('maps snake_case rows to camelCase and flattens the recipient', async () => {
    const client = {
      from: () => ({
        select: () => ({
          eq: () => ({
            order: () => Promise.resolve({
              data: [{
                id: 'occ-1',
                recipient_id: 'rec-1',
                kind: 'birthday',
                recurrence: 'annual',
                month: 3,
                day: 14,
                event_date: null,
                lead_days: 7,
                active: true,
                recipients: { name: 'Mum', relationship: 'mother' },
              }],
              error: null,
            }),
          }),
        }),
      }),
    };
    const rows = await listOccasions(client, 'cust-1');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: 'occ-1', recipientName: 'Mum', relationship: 'mother', leadDays: 7, eventDate: null });
  });

  it('returns an empty array when the query errors', async () => {
    const client = {
      from: () => ({ select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: null, error: { message: 'boom' } }) }) }) }),
    };
    expect(await listOccasions(client, 'cust-1')).toEqual([]);
  });
});

describe('upsertRecipient', () => {
  it('returns the existing id when the name already exists', async () => {
    const client = {
      from: () => ({
        select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { id: 'rec-existing' }, error: null }) }) }) }),
      }),
    };
    expect(await upsertRecipient(client, 'cust-1', { recipientName: 'Mum' })).toBe('rec-existing');
  });

  it('inserts and returns a new id when the name is new', async () => {
    const insert = vi.fn().mockReturnValue({ select: () => ({ maybeSingle: () => Promise.resolve({ data: { id: 'rec-new' }, error: null }) }) });
    const client = {
      from: () => ({
        select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) }),
        insert,
      }),
    };
    expect(await upsertRecipient(client, 'cust-1', { recipientName: 'Mum', relationship: 'mother' })).toBe('rec-new');
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ customer_id: 'cust-1', name: 'Mum', relationship: 'mother' }));
  });

  it('returns null when the insert fails', async () => {
    const client = {
      from: () => ({
        select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) }),
        insert: () => ({ select: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: { message: 'boom' } }) }) }),
      }),
    };
    expect(await upsertRecipient(client, 'cust-1', { recipientName: 'Mum' })).toBeNull();
  });
});

describe('insertOccasion', () => {
  it('writes annual fields and leaves event_date null', async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const client = { from: () => ({ insert }) };
    expect(await insertOccasion(client, 'cust-1', 'rec-1', validInput)).toBe('saved');
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ month: 3, day: 14, event_date: null, lead_days: 7 }));
  });

  it('writes event_date and leaves month/day null for a one-off', async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const client = { from: () => ({ insert }) };
    await insertOccasion(client, 'cust-1', 'rec-1', {
      recipientName: 'Youssef', kind: 'graduation', recurrence: 'once', eventDate: '2026-07-12', leadDays: 14, locale: 'en',
    });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ month: null, day: null, event_date: '2026-07-12' }));
  });

  it('reports failure when the insert errors', async () => {
    const client = { from: () => ({ insert: () => Promise.resolve({ error: { message: 'boom' } }) }) };
    expect(await insertOccasion(client, 'cust-1', 'rec-1', validInput)).toBe('failure');
  });
});

describe('deleteOccasion', () => {
  it('scopes the delete to the owning customer', async () => {
    const second = vi.fn().mockResolvedValue({ error: null });
    const first = vi.fn().mockReturnValue({ eq: second });
    const client = { from: () => ({ delete: () => ({ eq: first }) }) };
    expect(await deleteOccasion(client, 'cust-1', 'occ-1')).toBe('deleted');
    expect(first).toHaveBeenCalledWith('id', 'occ-1');
    expect(second).toHaveBeenCalledWith('customer_id', 'cust-1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/domain/occasion-repository.test.ts`
Expected: FAIL — `Cannot find module '@/features/occasions/repository'`

- [ ] **Step 3: Write the implementation**

```ts
// features/occasions/repository.ts
import type { OccasionInput } from './validation';

type Client = { from: (table: string) => any };

export type OccasionRow = {
  id: string;
  recipientId: string;
  recipientName: string;
  relationship: string | null;
  kind: string;
  recurrence: 'annual' | 'once';
  month: number | null;
  day: number | null;
  eventDate: string | null;
  leadDays: number;
  active: boolean;
};

const listSelect = 'id,recipient_id,kind,recurrence,month,day,event_date,lead_days,active,recipients(name,relationship)';

export async function listOccasions(client: Client, customerId: string): Promise<OccasionRow[]> {
  const { data, error } = await client
    .from('occasions')
    .select(listSelect)
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false });
  if (error) return [];
  return ((data ?? []) as Array<Record<string, any>>).map((row) => ({
    id: String(row.id),
    recipientId: String(row.recipient_id),
    recipientName: String(row.recipients?.name ?? ''),
    relationship: row.recipients?.relationship ?? null,
    kind: String(row.kind),
    recurrence: row.recurrence === 'once' ? 'once' : 'annual',
    month: row.month == null ? null : Number(row.month),
    day: row.day == null ? null : Number(row.day),
    eventDate: row.event_date ?? null,
    leadDays: Number(row.lead_days ?? 7),
    active: row.active !== false,
  }));
}

export async function listRecipients(client: Client, customerId: string): Promise<Array<{ id: string; name: string; relationship: string | null }>> {
  const { data, error } = await client
    .from('recipients')
    .select('id,name,relationship')
    .eq('customer_id', customerId)
    .order('name', { ascending: true });
  if (error) return [];
  return ((data ?? []) as Array<Record<string, any>>).map((row) => ({
    id: String(row.id),
    name: String(row.name),
    relationship: row.relationship ?? null,
  }));
}

/**
 * Reuse an existing contact when the name matches, otherwise create one.
 * The DB's unique (customer_id, name) makes this idempotent; looking first
 * keeps the returned id stable for the caller.
 */
export async function upsertRecipient(
  client: Client,
  customerId: string,
  input: { recipientName: string; recipientPhone?: string; relationship?: string },
): Promise<string | null> {
  const name = input.recipientName.trim();
  const { data: existing } = await client
    .from('recipients')
    .select('id')
    .eq('customer_id', customerId)
    .eq('name', name)
    .maybeSingle();
  if (existing?.id) return String(existing.id);

  const { data, error } = await client
    .from('recipients')
    .insert({
      customer_id: customerId,
      name,
      phone: input.recipientPhone?.trim() || null,
      relationship: input.relationship?.trim() || null,
    })
    .select('id')
    .maybeSingle();
  if (error || !data?.id) return null;
  return String(data.id);
}

/** Shape the row so it satisfies the occasion_shape check constraint. */
function occasionColumns(input: OccasionInput) {
  const annual = input.recurrence === 'annual';
  return {
    kind: input.kind,
    recurrence: input.recurrence,
    month: annual ? input.month ?? null : null,
    day: annual ? input.day ?? null : null,
    event_date: annual ? null : input.eventDate ?? null,
    lead_days: input.leadDays,
    locale: input.locale,
  };
}

export async function insertOccasion(client: Client, customerId: string, recipientId: string, input: OccasionInput): Promise<'saved' | 'failure'> {
  const { error } = await client.from('occasions').insert({
    customer_id: customerId,
    recipient_id: recipientId,
    ...occasionColumns(input),
  });
  return error ? 'failure' : 'saved';
}

export async function updateOccasion(client: Client, customerId: string, occasionId: string, input: OccasionInput): Promise<'saved' | 'failure'> {
  const { error } = await client
    .from('occasions')
    .update(occasionColumns(input))
    .eq('id', occasionId)
    .eq('customer_id', customerId);
  return error ? 'failure' : 'saved';
}

export async function deleteOccasion(client: Client, customerId: string, occasionId: string): Promise<'deleted' | 'failure'> {
  const { error } = await client
    .from('occasions')
    .delete()
    .eq('id', occasionId)
    .eq('customer_id', customerId);
  return error ? 'failure' : 'deleted';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/domain/occasion-repository.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: Typecheck and commit**

```bash
npm run lint
git add features/occasions/repository.ts tests/domain/occasion-repository.test.ts
git commit -m "feat: add occasion repository"
```

---

## Task 8: Server actions

**Files:**
- Create: `features/occasions/actions.ts`
- Test: `tests/domain/occasion-actions.test.ts`

**Interfaces:**
- Consumes: `getCurrentCustomer` (`features/auth/customer.ts`); `getAdminSupabase`; `validateOccasion` (Task 3); repository functions (Task 7)
- Produces:
  - `saveOccasion(input: unknown & { accountPath?: string }): Promise<'saved' | 'invalid' | 'unauthenticated' | 'failure'>`
  - `editOccasion(occasionId: string, input: unknown & { accountPath?: string }): Promise<'saved' | 'invalid' | 'unauthenticated' | 'failure'>`
  - `removeOccasion(occasionId: string, accountPath?: string): Promise<'deleted' | 'unauthenticated' | 'failure'>`

Each accepts optional injected deps (`customer`, `client`) so the actions are testable without mocking Next internals — the pattern established at `features/account/actions.ts:30`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/domain/occasion-actions.test.ts
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ getAdminSupabase: () => ({ from: () => ({}) }) }));
vi.mock('@/features/auth/customer', () => ({ getCurrentCustomer: vi.fn().mockResolvedValue(null) }));

const { removeOccasion, saveOccasion } = await import('@/features/occasions/actions');

const customer = { id: 'cust-1', email: 'nour@example.com', displayName: 'Nour', phone: '' };
const valid = { recipientName: 'Mum', kind: 'birthday', recurrence: 'annual', month: 3, day: 14, leadDays: 7, locale: 'en' };

describe('saveOccasion', () => {
  it('refuses an anonymous caller before touching the database', async () => {
    const client = { from: vi.fn() };
    expect(await saveOccasion({ ...valid, customer: null, client } as never)).toBe('unauthenticated');
    expect(client.from).not.toHaveBeenCalled();
  });

  it('rejects invalid input', async () => {
    const client = { from: vi.fn() };
    expect(await saveOccasion({ ...valid, month: 13, customer, client } as never)).toBe('invalid');
    expect(client.from).not.toHaveBeenCalled();
  });

  it('creates the recipient then the occasion', async () => {
    const insertOccasion = vi.fn().mockResolvedValue({ error: null });
    const client = {
      from: (table: string) => {
        if (table === 'recipients') {
          return {
            select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { id: 'rec-1' }, error: null }) }) }) }),
          };
        }
        return { insert: insertOccasion };
      },
    };
    expect(await saveOccasion({ ...valid, customer, client } as never)).toBe('saved');
    expect(insertOccasion).toHaveBeenCalledWith(expect.objectContaining({ customer_id: 'cust-1', recipient_id: 'rec-1' }));
  });

  it('fails when the recipient cannot be resolved', async () => {
    const client = {
      from: () => ({
        select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) }),
        insert: () => ({ select: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: { message: 'boom' } }) }) }),
      }),
    };
    expect(await saveOccasion({ ...valid, customer, client } as never)).toBe('failure');
  });
});

describe('removeOccasion', () => {
  it('refuses an anonymous caller', async () => {
    const client = { from: vi.fn() };
    expect(await removeOccasion('occ-1', undefined, { customer: null, client } as never)).toBe('unauthenticated');
    expect(client.from).not.toHaveBeenCalled();
  });

  it('deletes scoped to the customer', async () => {
    const second = vi.fn().mockResolvedValue({ error: null });
    const client = { from: () => ({ delete: () => ({ eq: () => ({ eq: second }) }) }) };
    expect(await removeOccasion('occ-1', undefined, { customer, client } as never)).toBe('deleted');
    expect(second).toHaveBeenCalledWith('customer_id', 'cust-1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/domain/occasion-actions.test.ts`
Expected: FAIL — `Cannot find module '@/features/occasions/actions'`

- [ ] **Step 3: Write the implementation**

```ts
// features/occasions/actions.ts
'use server';

import { revalidatePath } from 'next/cache';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getCurrentCustomer } from '@/features/auth/customer';
import { validateOccasion } from './validation';
import { deleteOccasion, insertOccasion, updateOccasion, upsertRecipient } from './repository';

type Customer = { id: string; email: string; displayName: string; phone: string } | null;
type Client = { from: (table: string) => any };
type ActionDeps = { customer?: Customer; client?: Client };

// Cloudflare has no middleware, so server actions cannot read locale/city
// headers. Callers pass the account base path; this is only a safe fallback.
function accountBase(path?: string): string {
  return path && path.startsWith('/') ? path : '/en';
}

async function resolveDeps(deps: ActionDeps): Promise<{ customer: Customer; client: Client }> {
  const customer = deps.customer !== undefined ? deps.customer : await getCurrentCustomer();
  const client = deps.client ?? getAdminSupabase();
  return { customer, client };
}

export async function saveOccasion(
  input: Record<string, unknown> & { accountPath?: string } & ActionDeps,
): Promise<'saved' | 'invalid' | 'unauthenticated' | 'failure'> {
  const { customer, client } = await resolveDeps(input);
  if (!customer) return 'unauthenticated';

  const parsed = validateOccasion(input);
  if (!parsed.ok) return 'invalid';

  const recipientId = await upsertRecipient(client, customer.id, parsed.value);
  if (!recipientId) return 'failure';

  const result = await insertOccasion(client, customer.id, recipientId, parsed.value);
  if (result === 'saved') revalidatePath(`${accountBase(input.accountPath)}/account/occasions`);
  return result;
}

export async function editOccasion(
  occasionId: string,
  input: Record<string, unknown> & { accountPath?: string } & ActionDeps,
): Promise<'saved' | 'invalid' | 'unauthenticated' | 'failure'> {
  const { customer, client } = await resolveDeps(input);
  if (!customer) return 'unauthenticated';

  const parsed = validateOccasion(input);
  if (!parsed.ok) return 'invalid';

  const recipientId = await upsertRecipient(client, customer.id, parsed.value);
  if (!recipientId) return 'failure';

  const result = await updateOccasion(client, customer.id, occasionId, parsed.value);
  if (result === 'saved') revalidatePath(`${accountBase(input.accountPath)}/account/occasions`);
  return result;
}

export async function removeOccasion(
  occasionId: string,
  accountPath?: string,
  deps: ActionDeps = {},
): Promise<'deleted' | 'unauthenticated' | 'failure'> {
  const { customer, client } = await resolveDeps(deps);
  if (!customer) return 'unauthenticated';

  const result = await deleteOccasion(client, customer.id, occasionId);
  if (result === 'deleted') revalidatePath(`${accountBase(accountPath)}/account/occasions`);
  return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/domain/occasion-actions.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Typecheck and commit**

```bash
npm run lint
git add features/occasions/actions.ts tests/domain/occasion-actions.test.ts
git commit -m "feat: add occasion server actions"
```

---

## Task 9: i18n keys

**Files:**
- Modify: `features/i18n/dictionaries.ts`
- Test: `tests/domain/occasion-i18n.test.ts`

**Interfaces:**
- Consumes: existing `messages` export
- Produces: 16 new keys present in `en`, `ar`, `fr`

- [ ] **Step 1: Write the failing test**

```ts
// tests/domain/occasion-i18n.test.ts
import { describe, expect, it } from 'vitest';
import { messages } from '@/features/i18n/dictionaries';

const KEYS = [
  'occasionsTitle', 'occasionsEyebrow', 'occasionsLede', 'occasionsEmpty', 'occasionsEmptyHint',
  'addDate', 'editDate', 'removeDate', 'remindDaysBefore',
  'recurrenceAnnual', 'recurrenceOnce', 'occasionRecipient', 'occasionRelationship',
  'occasionKind_birthday', 'occasionKind_anniversary', 'occasionKind_graduation', 'occasionKind_other',
  'occasionSaved', 'occasionRemoved', 'occasionInvalid',
] as const;

describe('occasion i18n keys', () => {
  for (const locale of ['en', 'ar', 'fr'] as const) {
    it(`defines every occasion key in ${locale}`, () => {
      const missing = KEYS.filter((key) => !messages[locale][key]);
      expect(missing).toEqual([]);
    });
  }

  it('uses Arabic script for the Arabic strings', () => {
    expect(messages.ar.occasionsTitle).toMatch(/[\u0600-\u06FF]/);
  });

  it('does not leave a locale copying the English string verbatim', () => {
    expect(messages.ar.occasionsTitle).not.toBe(messages.en.occasionsTitle);
    expect(messages.fr.occasionsTitle).not.toBe(messages.en.occasionsTitle);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/domain/occasion-i18n.test.ts`
Expected: FAIL — `expect(missing).toEqual([])` reports all 20 keys missing in each locale

- [ ] **Step 3: Add the keys**

`features/i18n/dictionaries.ts` stores each locale as one long object literal. Append these to the **en** object (anywhere inside it — the file already appends new features at the end of each locale block):

```ts
occasionsTitle: 'Your dates', occasionsEyebrow: 'Never miss a moment', occasionsLede: 'Save the dates that matter and we will remind you in good time.', occasionsEmpty: 'No dates saved yet.', occasionsEmptyHint: 'Add a birthday or anniversary and we will remind you before it arrives.', addDate: 'Add a date', editDate: 'Edit', removeDate: 'Remove', remindDaysBefore: 'remind {days} days before', recurrenceAnnual: 'annual', recurrenceOnce: 'once', occasionRecipient: 'Who is it for', occasionRelationship: 'Relationship', occasionKind_birthday: 'Birthday', occasionKind_anniversary: 'Anniversary', occasionKind_graduation: 'Graduation', occasionKind_other: 'Other', occasionSaved: 'Date saved with care.', occasionRemoved: 'Date removed.', occasionInvalid: 'Check the date details and try again.',
```

Append to the **ar** object:

```ts
occasionsTitle: 'مناسباتك', occasionsEyebrow: 'لا تفوت لحظة', occasionsLede: 'احفظ التواريخ المهمة وسنذكّرك في الوقت المناسب.', occasionsEmpty: 'لم تحفظ أي تاريخ بعد.', occasionsEmptyHint: 'أضف عيد ميلاد أو ذكرى وسنذكّرك قبل موعدها.', addDate: 'أضف تاريخاً', editDate: 'تعديل', removeDate: 'إزالة', remindDaysBefore: 'التذكير قبل {days} أيام', recurrenceAnnual: 'سنوي', recurrenceOnce: 'مرة واحدة', occasionRecipient: 'لمن هذه المناسبة', occasionRelationship: 'صلة القرابة', occasionKind_birthday: 'عيد ميلاد', occasionKind_anniversary: 'ذكرى', occasionKind_graduation: 'تخرج', occasionKind_other: 'أخرى', occasionSaved: 'تم حفظ التاريخ بعناية.', occasionRemoved: 'تم إزالة التاريخ.', occasionInvalid: 'تحقق من تفاصيل التاريخ وحاول مرة أخرى.',
```

Append to the **fr** object:

```ts
occasionsTitle: 'Vos dates', occasionsEyebrow: 'Ne manquez aucun moment', occasionsLede: 'Enregistrez les dates importantes et nous vous préviendrons à temps.', occasionsEmpty: 'Aucune date enregistrée.', occasionsEmptyHint: 'Ajoutez un anniversaire et nous vous préviendrons avant la date.', addDate: 'Ajouter une date', editDate: 'Modifier', removeDate: 'Retirer', remindDaysBefore: 'rappel {days} jours avant', recurrenceAnnual: 'annuel', recurrenceOnce: 'une fois', occasionRecipient: 'Pour qui', occasionRelationship: 'Relation', occasionKind_birthday: 'Anniversaire', occasionKind_anniversary: 'Anniversaire de mariage', occasionKind_graduation: 'Remise de diplôme', occasionKind_other: 'Autre', occasionSaved: 'Date enregistrée avec soin.', occasionRemoved: 'Date retirée.', occasionInvalid: 'Vérifiez les détails de la date et réessayez.',
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/domain/occasion-i18n.test.ts tests/domain/i18n-dictionary.test.ts`
Expected: PASS — new keys present in all three locales, and the existing parity test still green

- [ ] **Step 5: Typecheck and commit**

```bash
npm run lint
git add features/i18n/dictionaries.ts tests/domain/occasion-i18n.test.ts
git commit -m "feat: add occasion i18n keys"
```

---

## Task 10: Occasion form

**Files:**
- Create: `features/occasions/OccasionForm.tsx`
- Test: `tests/components/OccasionForm.test.tsx`

**Interfaces:**
- Consumes: `useI18n` (`features/i18n/I18nProvider.tsx`); `OCCASION_KINDS` + `LEAD_DAY_CHOICES` (Task 3); `Button`, `Input` from `components/ui`
- Produces: `OccasionForm({ recipients, onSubmit, initial? })` where `onSubmit(payload) => Promise<'saved' | 'invalid' | 'unauthenticated' | 'failure'>`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/components/OccasionForm.test.tsx
import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OccasionForm } from '@/features/occasions/OccasionForm';
import { renderWithProviders } from '../test-utils';

describe('OccasionForm', () => {
  it('shows month and day fields for an annual occasion by default', () => {
    renderWithProviders(<OccasionForm recipients={[]} onSubmit={vi.fn()} />);
    expect(screen.getByLabelText(/month/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/day/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/date/i)).toBeNull();
  });

  it('swaps to a single date field when switching to one-off', async () => {
    renderWithProviders(<OccasionForm recipients={[]} onSubmit={vi.fn()} />);
    await userEvent.click(screen.getByRole('radio', { name: /once/i }));
    expect(screen.getByLabelText(/date/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/month/i)).toBeNull();
  });

  it('submits an annual payload with the chosen lead time', async () => {
    const onSubmit = vi.fn().mockResolvedValue('saved');
    renderWithProviders(<OccasionForm recipients={[]} onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText(/who is it for/i), 'Mum');
    await userEvent.selectOptions(screen.getByLabelText(/month/i), '3');
    await userEvent.selectOptions(screen.getByLabelText(/day/i), '14');
    await userEvent.click(screen.getByRole('radio', { name: '14' }));
    await userEvent.click(screen.getByRole('button', { name: /add a date/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      recipientName: 'Mum', recurrence: 'annual', month: 3, day: 14, leadDays: 14,
    }));
  });

  it('submits a one-off payload with eventDate and no month/day', async () => {
    const onSubmit = vi.fn().mockResolvedValue('saved');
    renderWithProviders(<OccasionForm recipients={[]} onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText(/who is it for/i), 'Youssef');
    await userEvent.click(screen.getByRole('radio', { name: /once/i }));
    await userEvent.type(screen.getByLabelText(/date/i), '2026-07-12');
    await userEvent.click(screen.getByRole('button', { name: /add a date/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const payload = onSubmit.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload).toMatchObject({ recurrence: 'once', eventDate: '2026-07-12' });
    expect(payload.month).toBeUndefined();
    expect(payload.day).toBeUndefined();
  });

  it('surfaces a validation failure without clearing the form', async () => {
    const onSubmit = vi.fn().mockResolvedValue('invalid');
    renderWithProviders(<OccasionForm recipients={[]} onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText(/who is it for/i), 'Mum');
    await userEvent.click(screen.getByRole('button', { name: /add a date/i }));
    await waitFor(() => expect(screen.getByRole('status')).toBeInTheDocument());
    expect(screen.getByLabelText(/who is it for/i)).toHaveValue('Mum');
  });
});
```

`renderWithProviders` comes from `tests/test-utils.tsx` — the same helper `tests/components/EmailPreferences.test.tsx:3` uses.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/OccasionForm.test.tsx`
Expected: FAIL — `Cannot find module '@/features/occasions/OccasionForm'`

- [ ] **Step 3: Write the implementation**

```tsx
// features/occasions/OccasionForm.tsx
'use client';

import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusMessage } from '@/components/ui/status-message';
import { useI18n } from '@/features/i18n/I18nProvider';
import { LEAD_DAY_CHOICES, OCCASION_KINDS } from './validation';

type Recipient = { id: string; name: string; relationship: string | null };
type SubmitResult = 'saved' | 'invalid' | 'unauthenticated' | 'failure';

type OccasionFormProps = {
  recipients: Recipient[];
  onSubmit: (payload: Record<string, unknown>) => Promise<SubmitResult>;
  initial?: {
    recipientName?: string;
    relationship?: string;
    kind?: string;
    recurrence?: 'annual' | 'once';
    month?: number | null;
    day?: number | null;
    eventDate?: string | null;
    leadDays?: number;
  };
};

const MONTHS = Array.from({ length: 12 }, (_, index) => index + 1);
const DAYS = Array.from({ length: 31 }, (_, index) => index + 1);

export function OccasionForm({ recipients, onSubmit, initial }: OccasionFormProps) {
  const { t, locale } = useI18n();
  const [recipientName, setRecipientName] = useState(initial?.recipientName ?? '');
  const [relationship, setRelationship] = useState(initial?.relationship ?? '');
  const [kind, setKind] = useState(initial?.kind ?? 'birthday');
  const [recurrence, setRecurrence] = useState<'annual' | 'once'>(initial?.recurrence ?? 'annual');
  const [month, setMonth] = useState(String(initial?.month ?? ''));
  const [day, setDay] = useState(String(initial?.day ?? ''));
  const [eventDate, setEventDate] = useState(initial?.eventDate ?? '');
  const [leadDays, setLeadDays] = useState(initial?.leadDays ?? 7);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  const pill = (active: boolean) =>
    `press cursor-pointer rounded-full border px-5 py-2.5 text-sm transition-all duration-300 ${
      active
        ? 'border-2 border-primary bg-primary-fixed/25 text-on-surface'
        : 'border border-outline-variant/50 bg-surface text-on-surface hover:-translate-y-0.5 hover:bg-surface-container'
    }`;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    // Send only the fields for the selected recurrence, so the payload matches
    // the occasion_shape DB constraint exactly.
    const payload: Record<string, unknown> = {
      recipientName,
      relationship: relationship || undefined,
      kind,
      recurrence,
      leadDays,
      locale,
      ...(recurrence === 'annual'
        ? { month: month ? Number(month) : undefined, day: day ? Number(day) : undefined }
        : { eventDate: eventDate || undefined }),
    };
    const result = await onSubmit(payload);
    setBusy(false);
    setError(result !== 'saved');
    setMessage(result === 'saved' ? t('occasionSaved') : t('occasionInvalid'));
    if (result === 'saved') {
      setRecipientName('');
      setRelationship('');
      setMonth('');
      setDay('');
      setEventDate('');
    }
  }

  return (
    <form className="grid gap-6" onSubmit={submit} noValidate>
      {message ? <StatusMessage title={message} tone={error ? 'error' : 'success'} /> : null}

      <label className="grid gap-2" htmlFor="occasion-recipient">
        <span className="text-sm font-semibold text-on-surface">{t('occasionRecipient')}</span>
        <Input
          id="occasion-recipient"
          list="occasion-recipient-options"
          value={recipientName}
          onChange={(event) => setRecipientName(event.target.value)}
          required
        />
        <datalist id="occasion-recipient-options">
          {recipients.map((recipient) => <option key={recipient.id} value={recipient.name} />)}
        </datalist>
      </label>

      <label className="grid gap-2" htmlFor="occasion-relationship">
        <span className="text-sm font-semibold text-on-surface">{t('occasionRelationship')}</span>
        <Input id="occasion-relationship" value={relationship} onChange={(event) => setRelationship(event.target.value)} />
      </label>

      <fieldset className="grid gap-3 border-0 p-0">
        <legend className="price text-xs font-medium uppercase tracking-widest text-on-surface-variant">{t('category')}</legend>
        <div className="flex flex-wrap gap-3">
          {OCCASION_KINDS.map((option) => (
            <label key={option} className={pill(kind === option)}>
              <input type="radio" name="occasionKind" value={option} checked={kind === option} onChange={() => setKind(option)} className="sr-only" />
              {t(`occasionKind_${option}`)}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="grid gap-3 border-0 p-0">
        <legend className="price text-xs font-medium uppercase tracking-widest text-on-surface-variant">{t('sort')}</legend>
        <div className="flex flex-wrap gap-3">
          {(['annual', 'once'] as const).map((option) => (
            <label key={option} className={pill(recurrence === option)}>
              <input type="radio" name="recurrence" value={option} checked={recurrence === option} onChange={() => setRecurrence(option)} className="sr-only" />
              {option === 'annual' ? t('recurrenceAnnual') : t('recurrenceOnce')}
            </label>
          ))}
        </div>
      </fieldset>

      {recurrence === 'annual' ? (
        <div className="grid grid-cols-2 gap-4">
          <label className="grid gap-2" htmlFor="occasion-month">
            <span className="text-sm font-semibold text-on-surface">Month</span>
            <select
              id="occasion-month"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
              className="h-11 rounded-full border border-outline-variant bg-surface px-4 text-sm"
              required
            >
              <option value="">—</option>
              {MONTHS.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <label className="grid gap-2" htmlFor="occasion-day">
            <span className="text-sm font-semibold text-on-surface">Day</span>
            <select
              id="occasion-day"
              value={day}
              onChange={(event) => setDay(event.target.value)}
              className="h-11 rounded-full border border-outline-variant bg-surface px-4 text-sm"
              required
            >
              <option value="">—</option>
              {DAYS.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
        </div>
      ) : (
        <label className="grid gap-2" htmlFor="occasion-date">
          <span className="text-sm font-semibold text-on-surface">Date</span>
          <Input id="occasion-date" type="date" value={eventDate} onChange={(event) => setEventDate(event.target.value)} required />
        </label>
      )}

      <fieldset className="grid gap-3 border-0 p-0">
        <legend className="price text-xs font-medium uppercase tracking-widest text-on-surface-variant">
          {t('remindDaysBefore', { days: leadDays })}
        </legend>
        <div className="flex flex-wrap gap-3">
          {LEAD_DAY_CHOICES.map((value) => (
            <label key={value} className={pill(leadDays === value)}>
              <input type="radio" name="leadDays" value={value} checked={leadDays === value} onChange={() => setLeadDays(value)} className="sr-only" />
              {value}
            </label>
          ))}
        </div>
      </fieldset>

      <Button type="submit" disabled={busy} className="lift press justify-center">
        {t('addDate')}
      </Button>
    </form>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/components/OccasionForm.test.tsx`
Expected: PASS (5 tests)

- [ ] **Step 5: Typecheck and commit**

```bash
npm run lint
git add features/occasions/OccasionForm.tsx tests/components/OccasionForm.test.tsx
git commit -m "feat: add occasion form"
```

---

## Task 11: Account page and navigation

**Files:**
- Create: `features/occasions/OccasionList.tsx`
- Create: `features/occasions/OccasionsPanel.tsx`
- Create: `app/[locale]/[city]/account/(dashboard)/occasions/page.tsx`
- Modify: `components/account/AccountShell.tsx`
- Test: `tests/components/OccasionList.test.tsx`

**Interfaces:**
- Consumes: `listOccasions` + `listRecipients` (Task 7); `saveOccasion` + `removeOccasion` (Task 8); `OccasionForm` (Task 10); `AccountShell`
- Produces: the `/account/occasions` route and a nav entry

- [ ] **Step 1: Write the failing test**

```tsx
// tests/components/OccasionList.test.tsx
import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { OccasionList } from '@/features/occasions/OccasionList';
import { renderWithProviders } from '../test-utils';

const annual = {
  id: 'occ-1', recipientId: 'rec-1', recipientName: 'Mum', relationship: 'mother',
  kind: 'birthday', recurrence: 'annual' as const, month: 3, day: 14, eventDate: null,
  leadDays: 7, active: true,
};

const once = {
  id: 'occ-2', recipientId: 'rec-2', recipientName: 'Youssef', relationship: null,
  kind: 'graduation', recurrence: 'once' as const, month: null, day: null,
  eventDate: '2026-07-12', leadDays: 14, active: true,
};

describe('OccasionList', () => {
  it('renders a composed empty state rather than bare text', () => {
    renderWithProviders(<OccasionList occasions={[]} onRemove={vi.fn()} />);
    expect(screen.getByText(/no dates saved yet/i)).toBeInTheDocument();
    expect(screen.getByText(/add a birthday or anniversary/i)).toBeInTheDocument();
  });

  it('shows the recipient, relationship and recurrence for each row', () => {
    renderWithProviders(<OccasionList occasions={[annual, once]} onRemove={vi.fn()} />);
    expect(screen.getByText('Mum')).toBeInTheDocument();
    expect(screen.getByText(/mother/i)).toBeInTheDocument();
    expect(screen.getByText(/annual/i)).toBeInTheDocument();
    expect(screen.getByText(/once/i)).toBeInTheDocument();
  });

  it('shows the lead time for each row', () => {
    renderWithProviders(<OccasionList occasions={[annual]} onRemove={vi.fn()} />);
    expect(screen.getByText(/remind 7 days before/i)).toBeInTheDocument();
  });

  it('renders a remove control per occasion', () => {
    renderWithProviders(<OccasionList occasions={[annual, once]} onRemove={vi.fn()} />);
    expect(screen.getAllByRole('button', { name: /remove/i })).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/OccasionList.test.tsx`
Expected: FAIL — `Cannot find module '@/features/occasions/OccasionList'`

- [ ] **Step 3: Write the list component**

```tsx
// features/occasions/OccasionList.tsx
'use client';

import { CalendarHeart, X } from 'lucide-react';
import { useI18n } from '@/features/i18n/I18nProvider';
import type { OccasionRow } from './repository';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function formatWhen(occasion: OccasionRow): string {
  if (occasion.recurrence === 'once') return occasion.eventDate ?? '';
  if (occasion.month == null || occasion.day == null) return '';
  return `${occasion.day} ${MONTH_NAMES[occasion.month - 1] ?? ''}`.trim();
}

export function OccasionList({ occasions, onRemove }: { occasions: OccasionRow[]; onRemove: (id: string) => void }) {
  const { t } = useI18n();

  if (occasions.length === 0) {
    return (
      <div className="grid justify-items-start gap-4 border-t border-outline-variant/25 py-16">
        <CalendarHeart className="h-8 w-8 text-sage" aria-hidden="true" />
        <p className="font-display text-2xl text-on-surface">{t('occasionsEmpty')}</p>
        <p className="max-w-md text-sm leading-relaxed text-on-surface-variant">{t('occasionsEmptyHint')}</p>
      </div>
    );
  }

  return (
    <ul className="grid">
      {occasions.map((occasion) => (
        <li key={occasion.id} className="flex flex-wrap items-start justify-between gap-4 border-b border-outline-variant/40 py-5">
          <span className="grid gap-1">
            <span className="flex flex-wrap items-center gap-2">
              <strong className="text-sm font-semibold text-on-surface">{occasion.recipientName}</strong>
              {occasion.relationship ? <span className="text-sm text-on-surface-variant">· {occasion.relationship}</span> : null}
            </span>
            <span className="text-sm text-on-surface-variant">{t(`occasionKind_${occasion.kind}`)}</span>
            <span className="price text-xs text-on-surface-variant">{t('remindDaysBefore', { days: occasion.leadDays })}</span>
          </span>
          <span className="flex items-center gap-3">
            <span
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                occasion.recurrence === 'annual'
                  ? 'bg-secondary-container text-on-secondary-container'
                  : 'bg-surface-variant text-on-surface-variant'
              }`}
            >
              {occasion.recurrence === 'annual' ? t('recurrenceAnnual') : t('recurrenceOnce')}
            </span>
            <span className="price text-sm text-on-surface">{formatWhen(occasion)}</span>
            <button
              type="button"
              onClick={() => onRemove(occasion.id)}
              aria-label={t('removeDate')}
              className="press grid h-9 w-9 place-items-center rounded-full border border-outline-variant/50 text-on-surface-variant transition-colors hover:border-primary hover:text-primary"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </span>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 4: Write the page**

```tsx
// app/[locale]/[city]/account/(dashboard)/occasions/page.tsx
import { redirect } from 'next/navigation';
import { getCurrentCustomer } from '@/features/auth/customer';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getServerT } from '@/features/i18n/server';
import { listOccasions, listRecipients } from '@/features/occasions/repository';
import { OccasionsPanel } from '@/features/occasions/OccasionsPanel';

type PageParams = { params: Promise<{ locale: string; city: string }> };

export default async function OccasionsPage({ params }: PageParams) {
  const { locale, city } = await params;
  const customer = await getCurrentCustomer();
  if (!customer) redirect(`/${locale}/${city}/account/login`);

  const { t } = await getServerT(locale);
  const client = getAdminSupabase();
  const [occasions, recipients] = await Promise.all([
    listOccasions(client, customer.id),
    listRecipients(client, customer.id),
  ]);

  return (
    <section className="grid gap-8">
      <header className="grid gap-3 border-b border-outline-variant/25 pb-8">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-sage">{t('occasionsEyebrow')}</p>
        <h1 className="font-display text-[clamp(2rem,4vw,3rem)] font-semibold leading-[1.05] tracking-[-0.02em] text-primary">
          {t('occasionsTitle')}
        </h1>
        <p className="max-w-xl text-[1.05rem] leading-relaxed text-on-surface-variant">{t('occasionsLede')}</p>
      </header>
      <OccasionsPanel occasions={occasions} recipients={recipients} accountPath={`/${locale}/${city}`} />
    </section>
  );
}
```

- [ ] **Step 5: Write the client panel that wires actions to the form and list**

```tsx
// features/occasions/OccasionsPanel.tsx
'use client';

import { useState } from 'react';
import { removeOccasion, saveOccasion } from './actions';
import { OccasionForm } from './OccasionForm';
import { OccasionList } from './OccasionList';
import type { OccasionRow } from './repository';

type PanelProps = {
  occasions: OccasionRow[];
  recipients: Array<{ id: string; name: string; relationship: string | null }>;
  accountPath: string;
};

export function OccasionsPanel({ occasions, recipients, accountPath }: PanelProps) {
  const [rows, setRows] = useState(occasions);

  async function handleRemove(id: string) {
    const result = await removeOccasion(id, accountPath);
    if (result === 'deleted') setRows((current) => current.filter((row) => row.id !== id));
  }

  return (
    <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:gap-16">
      <OccasionList occasions={rows} onRemove={handleRemove} />
      <OccasionForm
        recipients={recipients}
        onSubmit={(payload) => saveOccasion({ ...payload, accountPath })}
      />
    </div>
  );
}
```

Add `OccasionsPanel.tsx` to the created-files list when committing.

- [ ] **Step 6: Add the nav entry**

In `components/account/AccountShell.tsx`, import `CalendarHeart` from `lucide-react` and add an entry between Wishlist and Email preferences using the existing `navLink` helper and `href('/account/occasions')`, labelled `t('occasionsTitle')`.

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run tests/components/OccasionList.test.tsx tests/components/AccountNavItem.test.tsx`
Expected: PASS — 4 new tests, existing nav tests still green

- [ ] **Step 8: Typecheck, full suite, commit**

```bash
npm run lint
npm test
git add features/occasions/OccasionList.tsx features/occasions/OccasionsPanel.tsx "app/[locale]/[city]/account/(dashboard)/occasions/page.tsx" components/account/AccountShell.tsx tests/components/OccasionList.test.tsx
git commit -m "feat: add occasions account page"
```

---

## Task 12: Documentation and scheduler wiring

**Files:**
- Modify: `docs/setup/runbook.md`
- Modify: `.env.example` (only if a new variable is needed — it should not be; the job reuses `CRON_SECRET` and `EMAIL_PREFERENCES_SECRET`)

- [ ] **Step 1: Document the new cron endpoint**

In `docs/setup/runbook.md`, find the existing cron section (search for `CRON_ENDPOINT`, around line 389) and add a subsection matching its style:

```markdown
### Occasion reminders scheduler

- `CRON_ENDPOINT` — `https://rosette.<account>.workers.dev/api/cron/occasions`
- Method: `POST` (or `GET` if your scheduler cannot POST)
- Header: `Authorization: Bearer $CRON_SECRET`
- Frequency: once daily. Reminders fire when
  `remindOn <= today <= occasion`, so a missed run catches up on the next day
  rather than skipping the occasion for a year.
- Response: `{ ok: true, summary: { checked, sent, failed, suppressed } }`

Reuses `CRON_SECRET` and `EMAIL_PREFERENCES_SECRET`; no new environment
variables are required.
```

- [ ] **Step 2: Verify no new env vars are needed**

Run: `rg -n "getRequiredServerEnv|getOptionalServerEnv" features/occasions app/api/cron/occasions`
Expected: only `CRON_SECRET` and `EMAIL_PREFERENCES_SECRET`, both already in `.env.example`. If anything else appears, add it to `.env.example` with a comment.

- [ ] **Step 3: Full verification**

```bash
npm run lint
npm test
```
Expected: `tsc` clean, eslint 0 errors, all tests pass (707 existing + roughly 78 new)

- [ ] **Step 4: Commit**

```bash
git add docs/setup/runbook.md
git commit -m "docs: document the occasion reminder scheduler"
```

---

## Verification

Manual checks once the plan is complete:

1. **Apply the migration:** `supabase db push`, then confirm the three tables exist and RLS is on.
2. **Add a date** at `/en/cairo/account/occasions` — a birthday 7 days out.
3. **Trigger the cron:**
   ```bash
   curl.exe -s -X POST -H "Authorization: Bearer $CRON_SECRET" http://127.0.0.1:3000/api/cron/occasions
   ```
   Expect `{ ok: true, summary: { checked: 1, sent: 1, ... } }`.
4. **Re-run immediately** — expect `sent: 0`, proving the ledger's idempotency.
5. **Disable engagement email** in account settings, add another date, re-run — expect `suppressed: 1` and a ledger row with `suppressed_reason: 'engagement_disabled'`.
6. **Check the logs:** `npx wrangler tail` should show `cron.occasions.started` and `cron.occasions.completed` with the summary.
