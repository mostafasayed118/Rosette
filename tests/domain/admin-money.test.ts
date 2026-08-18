import { describe, expect, it } from 'vitest';
import { minorToEgp, toMinor } from '@/features/admin/money';

describe('admin money helpers', () => {
  it('round-trips minor to EGP string and back', () => {
    expect(minorToEgp(1234)).toBe('12.34');
    expect(toMinor('12.34')).toBe(1234);
  });

  it('handles zero and empty string', () => {
    expect(minorToEgp(0)).toBe('0.00');
    expect(toMinor('')).toBe(0);
  });

  it('rounds fractional EGP to the nearest minor unit', () => {
    expect(toMinor('12.345')).toBe(1235);
  });

  it('returns 0 for non-numeric input', () => {
    expect(toMinor('abc')).toBe(0);
  });
});
