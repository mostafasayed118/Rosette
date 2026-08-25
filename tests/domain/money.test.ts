import { describe, expect, it } from 'vitest';
import { formatMoney } from '@/features/money';

describe('formatMoney', () => {
  it('renders a positive amount in the locale currency', () => {
    expect(formatMoney(11500, 'en')).toMatch(/115/);
    expect(formatMoney(11500, 'en')).toMatch(/EGP|£/);
  });

  it('returns an em dash for non-finite values rather than NaN EGP', () => {
    expect(formatMoney(NaN, 'en')).toBe('—');
    expect(formatMoney(Number.POSITIVE_INFINITY, 'en')).toBe('—');
    expect(formatMoney(Number.NEGATIVE_INFINITY, 'ar')).toBe('—');
  });

  it('renders a negative amount with the locale negative pattern', () => {
    // Refunds and promo-discount lines can be negative. The formatter must
    // not reject them; the locale's Intl.NumberFormat renders the sign.
    const out = formatMoney(-1000, 'en');
    expect(out).not.toBe('—');
    expect(out).toMatch(/-/);
  });
});
