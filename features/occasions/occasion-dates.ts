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
