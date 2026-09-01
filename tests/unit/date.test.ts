import { describe, it, expect } from 'vitest';
import { formatDateTime, formatDate } from '@/lib/date';

describe('lib/date Cairo timezone (R-05)', () => {
  // Summer instant: Cairo = UTC+3. 10:00 UTC -> 13:00 Cairo (same calendar day).
  const middayInstant = new Date('2026-06-01T10:00:00Z');
  // Near-midnight UTC instant that crosses the Cairo date boundary:
  // 23:00 UTC -> 02:00 Cairo next day (UTC+3). Dates differ between zones.
  const boundaryInstant = new Date('2026-06-01T23:00:00Z');

  it('formatDateTime renders Cairo-local time, not UTC', () => {
    const cairo = formatDateTime(middayInstant, 'en');
    const utc = middayInstant.toLocaleString('en-GB', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'UTC',
    });

    // Must not be the UTC rendering, and must not contain the UTC hour "10:00".
    expect(cairo).not.toEqual(utc);
    expect(cairo).not.toContain('10:00');
  });

  it('formatDate pins to Africa/Cairo', () => {
    const cairo = formatDate(boundaryInstant, 'en');
    const utc = boundaryInstant.toLocaleDateString('en-GB', {
      dateStyle: 'medium',
      timeZone: 'UTC',
    });
    // The boundary instant flips the calendar day between UTC and Cairo.
    expect(cairo).not.toEqual(utc);
  });

  it('differs from the raw UTC string of the same instant', () => {
    const cairo = formatDateTime(middayInstant, 'en');
    const utcRaw = middayInstant.toLocaleString('en-GB', { timeZone: 'UTC' });
    expect(cairo).not.toEqual(utcRaw);
  });
});
