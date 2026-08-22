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

/**
 * Parse a `YYYY-MM-DD` calendar date to a UTC timestamp, or null if it does not
 * parse. Callers are the guard for *ranges*: month 1-12, day 1-31 and
 * lead_days 1-30 are enforced by the CHECK constraints in
 * `supabase/migrations/018_occasion_reminders.sql`, and `event_date` is a
 * Postgres `date`, so malformed values cannot reach this module from the
 * database; the write path is guarded by its own zod schema. This module
 * therefore validates parseability only, never ranges.
 *
 * The `??` coalesces exist because `noUncheckedIndexedAccess` types the
 * destructured segments as `number | undefined`. They deliberately default to
 * `NaN` rather than to a plausible-looking date: the `Number.isFinite` check
 * below is what does the work, and a reader should not mistake a fallback for a
 * validated value.
 */
function toUtc(date: string): number | null {
  const [year, month, day] = date.split('-').map(Number);
  const ms = Date.UTC(year ?? Number.NaN, (month ?? Number.NaN) - 1, day ?? Number.NaN);
  return Number.isFinite(ms) ? ms : null;
}

/** Format a UTC timestamp as `YYYY-MM-DD`, or null if it is not a real instant. */
function fromUtc(ms: number): string | null {
  if (!Number.isFinite(ms)) return null;
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
  const now = toUtc(today);
  if (now === null) return null;
  if (schedule.recurrence === 'once') {
    if (!schedule.eventDate) return null;
    const event = toUtc(schedule.eventDate);
    if (event === null) return null;
    return event >= now ? schedule.eventDate : null;
  }
  if (schedule.month == null || schedule.day == null) return null;
  const year = Number(today.slice(0, 4));
  const thisYear = clampToMonth(year, schedule.month, schedule.day);
  const thisYearMs = toUtc(thisYear);
  if (thisYearMs === null) return null;
  if (thisYearMs >= now) return thisYear;
  return clampToMonth(year + 1, schedule.month, schedule.day);
}

/** The date the reminder should first go out, or null if not applicable. */
export function remindOnDate(schedule: OccasionSchedule, today: string): string | null {
  const occurrence = nextOccurrence(schedule, today);
  if (!occurrence) return null;
  const occurrenceMs = toUtc(occurrence);
  if (occurrenceMs === null || !Number.isFinite(schedule.leadDays)) return null;
  return fromUtc(occurrenceMs - schedule.leadDays * DAY_MS);
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
  const occurrenceMs = toUtc(occurrence);
  const remindOnMs = toUtc(remindOn);
  if (now === null || occurrenceMs === null || remindOnMs === null) return false;
  return remindOnMs <= now && occurrenceMs >= now;
}

/** Whole days between two calendar dates, or NaN if either does not parse. */
export function daysUntil(from: string, to: string): number {
  const fromMs = toUtc(from);
  const toMs = toUtc(to);
  if (fromMs === null || toMs === null) return Number.NaN;
  return Math.round((toMs - fromMs) / DAY_MS);
}

/** Ledger key: the year of the upcoming occurrence. */
export function cycleYearFor(schedule: OccasionSchedule, today: string): number | null {
  const occurrence = nextOccurrence(schedule, today);
  return occurrence ? Number(occurrence.slice(0, 4)) : null;
}
