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
    expect(OCCASION_KINDS).toEqual(['birthday', 'anniversary', 'graduation', 'other']);
    expect(LEAD_DAY_CHOICES).toEqual([3, 7, 14]);
  });

  it('allows leadDays outside the UI presets but inside 1-30', () => {
    expect(validateOccasion({ ...annual, leadDays: 10 }).ok).toBe(true);
  });

  it('surfaces the refine message when recurrence shape is wrong', () => {
    const result = validateOccasion({ ...annual, month: undefined });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('annual occasions need month and day; one-off occasions need an event date');
  });

  it('surfaces a non-empty field-level error', () => {
    const result = validateOccasion({ ...annual, kind: 'wedding' as never });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.length).toBeGreaterThan(0);
  });

  it('rejects impossible calendar dates', () => {
    const badDates = ['2026-02-30', '2026-13-45', '0000-00-00'];
    for (const d of badDates) {
      const result = validateOccasion({ ...once, eventDate: d });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe('eventDate must be a valid calendar date');
    }
  });

  it('rejects an invalid leap-year date', () => {
    const result = validateOccasion({ ...once, eventDate: '2023-02-29' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('eventDate must be a valid calendar date');
  });

  it('normalises whitespace-only optional fields to undefined', () => {
    const result = validateOccasion({ ...annual, recipientPhone: '   ', relationship: ' ' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.recipientPhone).toBeUndefined();
      expect(result.value.relationship).toBeUndefined();
    }
  });

  it('normalises empty-string optional fields to undefined', () => {
    const result = validateOccasion({ ...annual, recipientPhone: '', relationship: '' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.recipientPhone).toBeUndefined();
      expect(result.value.relationship).toBeUndefined();
    }
  });

  it('trims genuinely provided optional fields', () => {
    const result = validateOccasion({ ...annual, recipientPhone: '  +971501234567  ', relationship: '  friend  ' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.recipientPhone).toBe('+971501234567');
      expect(result.value.relationship).toBe('friend');
    }
  });
});
