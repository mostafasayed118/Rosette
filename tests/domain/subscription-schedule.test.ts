import { describe, expect, it } from 'vitest';
import { addInterval, datesFrom, parseDateRef, toDateRef } from '@/features/subscriptions/schedule';

describe('schedule date math', () => {
  it('toDateRef and parseDateRef round-trip a UTC date', () => {
    const ref = toDateRef(new Date(Date.UTC(2026, 8, 12)));
    expect(ref).toBe('2026-09-12');
    expect(parseDateRef(ref).getTime()).toBe(Date.UTC(2026, 8, 12));
  });
  it('weekly adds 7 days', () => { expect(addInterval('2026-09-12', 'weekly')).toBe('2026-09-19'); });
  it('biweekly adds 14 days', () => { expect(addInterval('2026-09-12', 'biweekly')).toBe('2026-09-26'); });
  it('monthly anchors on day-of-month across shorter months', () => {
    expect(addInterval('2026-01-31', 'monthly')).toBe('2026-02-28');
    expect(addInterval('2026-02-28', 'monthly')).toBe('2026-03-31');
  });
  it('monthly on a normal day preserves the day', () => { expect(addInterval('2026-03-15', 'monthly')).toBe('2026-04-15'); });
  it('datesFrom builds a full cadence', () => {
    expect(datesFrom('2026-09-12', 'weekly', 3)).toEqual(['2026-09-12', '2026-09-19', '2026-09-26']);
  });
  it('datesFrom with count 1 returns just the anchor', () => { expect(datesFrom('2026-09-12', 'weekly', 1)).toEqual(['2026-09-12']); });
});
