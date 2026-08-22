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

  it('returns the event date for a one-off happening today', () => {
    // Task 5's cron evaluates this boundary on every run: a same-day one-off still counts.
    expect(nextOccurrence(once('2026-07-12'), '2026-07-12')).toBe('2026-07-12');
  });

  it('returns null when annual fields are missing', () => {
    expect(nextOccurrence({ recurrence: 'annual', leadDays: 7 }, '2026-01-01')).toBeNull();
  });

  it('returns null when the one-off event date is missing', () => {
    expect(nextOccurrence({ recurrence: 'once', leadDays: 7 }, '2026-01-01')).toBeNull();
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

  it('returns null when there is no upcoming occurrence', () => {
    expect(remindOnDate(once('2026-07-12'), '2026-07-13')).toBeNull();
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

  it('counts backwards when the target is in the past', () => {
    expect(daysUntil('2026-03-14', '2026-03-07')).toBe(-7);
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

describe('unparseable dates', () => {
  // Ranges (month 1-12, day 1-31, lead_days 1-30) are enforced by the 018 migration's
  // CHECK constraints and by the write-path zod schema; this module only guards parseability.
  it('nextOccurrence returns null when today does not parse', () => {
    expect(nextOccurrence(annual(3, 14), 'garbage')).toBeNull();
  });

  it('nextOccurrence returns null when the one-off event date does not parse', () => {
    expect(nextOccurrence(once('garbage'), '2026-01-01')).toBeNull();
  });

  it('remindOnDate returns null when today does not parse', () => {
    expect(remindOnDate(annual(3, 14), 'garbage')).toBeNull();
  });

  it('remindOnDate returns null when leadDays is not a finite number', () => {
    expect(remindOnDate({ recurrence: 'annual', month: 3, day: 14, leadDays: Number.NaN }, '2026-01-01')).toBeNull();
  });

  it('isReminderDue is false when today does not parse', () => {
    expect(isReminderDue(annual(3, 14), 'garbage')).toBe(false);
  });

  it('cycleYearFor returns null when today does not parse', () => {
    expect(cycleYearFor(annual(3, 14), 'garbage')).toBeNull();
  });

  it('daysUntil returns NaN rather than a misleading zero', () => {
    expect(daysUntil('garbage', '2026-03-14')).toBeNaN();
    expect(daysUntil('2026-03-14', 'garbage')).toBeNaN();
  });
});
