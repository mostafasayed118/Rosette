import { describe, expect, it } from 'vitest';
import { validatePromo, computeDiscount, applyPromoToOrderTotals, type PromoRow } from '@/features/promo/apply';

const now = new Date('2026-08-18T12:00:00Z');
const percentPromo: PromoRow = { code: 'ROSE10', type: 'percent', percent_off: 10, value_minor: null, minimum_order_minor: 0, starts_at: null, expires_at: null, max_uses: 0, used_count: 0, active: true };
const fixedPromo: PromoRow = { code: 'EGP50', type: 'fixed', percent_off: null, value_minor: 5000, minimum_order_minor: 0, starts_at: null, expires_at: null, max_uses: 0, used_count: 0, active: true };

describe('validatePromo', () => {
  it('accepts a valid active promo', () => {
    expect(validatePromo(percentPromo, 10000, now)).toBeNull();
  });
  it('rejects inactive promos', () => {
    expect(validatePromo({ ...percentPromo, active: false }, 10000, now)).toBe('inactive');
  });
  it('rejects promos that have not started', () => {
    expect(validatePromo({ ...percentPromo, starts_at: '2026-08-19T00:00:00Z' }, 10000, now)).toBe('not_started');
  });
  it('rejects expired promos', () => {
    expect(validatePromo({ ...percentPromo, expires_at: '2026-08-17T00:00:00Z' }, 10000, now)).toBe('expired');
  });
  it('rejects promos at their usage cap', () => {
    expect(validatePromo({ ...percentPromo, max_uses: 5, used_count: 5 }, 10000, now)).toBe('max_uses');
    expect(validatePromo({ ...percentPromo, max_uses: 5, used_count: 4 }, 10000, now)).toBeNull();
    expect(validatePromo({ ...percentPromo, max_uses: 0, used_count: 99 }, 10000, now)).toBeNull();
  });
  it('rejects promos below the minimum order', () => {
    expect(validatePromo({ ...percentPromo, minimum_order_minor: 20000 }, 10000, now)).toBe('below_minimum');
  });
});

describe('computeDiscount', () => {
  it('rounds percent discounts', () => {
    expect(computeDiscount(percentPromo, 12345)).toEqual({ discountMinor: 1235, totalMinor: 11110 });
  });
  it('caps fixed discounts at the subtotal', () => {
    expect(computeDiscount(fixedPromo, 3000)).toEqual({ discountMinor: 3000, totalMinor: 0 });
    expect(computeDiscount(fixedPromo, 10000)).toEqual({ discountMinor: 5000, totalMinor: 5000 });
  });
  it('never discounts below zero even for huge percents', () => {
    expect(computeDiscount({ ...percentPromo, percent_off: 200 }, 10000)).toEqual({ discountMinor: 10000, totalMinor: 0 });
  });
});

describe('applyPromoToOrderTotals', () => {
  it('computes total as subtotal plus delivery minus discount', () => {
    expect(applyPromoToOrderTotals({ subtotalMinor: 10000, deliveryFeeMinor: 7500 }, percentPromo)).toEqual({ subtotalMinor: 10000, deliveryFeeMinor: 7500, discountMinor: 1000, totalMinor: 16500 });
  });
});
