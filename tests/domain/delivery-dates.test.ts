import { describe, expect, it } from 'vitest';
import { defaultDeliveryDate, minDeliveryDate } from '@/features/delivery/dates';

describe('delivery dates', () => {
  it('minDeliveryDate returns today in local YYYY-MM-DD', () => {
    expect(minDeliveryDate(new Date(2026, 7, 18))).toBe('2026-08-18');
  });

  it('defaultDeliveryDate returns today + 2 days', () => {
    expect(defaultDeliveryDate(new Date(2026, 7, 18))).toBe('2026-08-20');
  });

  it('pads month and day and rolls across month boundaries', () => {
    expect(minDeliveryDate(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(defaultDeliveryDate(new Date(2026, 0, 30))).toBe('2026-02-01');
  });

  it('rolls across the year boundary', () => {
    expect(defaultDeliveryDate(new Date(2026, 11, 31))).toBe('2027-01-02');
  });
});
