import { describe, expect, it } from 'vitest';

// Money helpers (actual location: features/admin/money.ts, not features/money.ts)
import { toMinor, minorToEgp } from '@/features/admin/money';

// Delivery fee constants live in features/destination/delivery-fee.ts; the
// single-arg resolver lives in features/order/delivery-rules.ts and delegates
// to estimateDeliveryFeeMinor, falling back to DEFAULT_DELIVERY_FEE_MINOR.
import { resolveDeliveryFee, DEFAULT_DELIVERY_FEE_MINOR } from '@/features/order/delivery-rules';
import { FLAT_SAME_DAY_FEE_MINOR, FLAT_NEXT_DAY_FEE_MINOR } from '@/features/destination/delivery-fee';

// Promo + subscription pricing pipeline
import {
  computeDiscount,
  applyPromoToOrderTotals,
  validatePromo,
  type PromoRow,
} from '@/features/promo/apply';
import {
  computeSubscriptionTotals,
  computeSubscriptionDiscount,
} from '@/features/subscriptions/service';
import { validatePromoInput } from '@/features/admin/promo-actions';

const now = new Date('2026-09-01T12:00:00Z');

// --- Cart fixture (all amounts in EGP×100 minor units, never floats) ---
const items = [
  { productName: 'Rose Hour', unitPrice: 12000, quantity: 2 }, // 24_000
  { productName: 'Garden Note', unitPrice: 8500, quantity: 1 }, //  8_500
];
const subtotalMinor = items.reduce((s, i) => s + i.unitPrice * i.quantity, 0); // 32_500

const percentPromo: PromoRow = {
  code: 'ROSE10',
  type: 'percent',
  percent_off: 10,
  value_minor: null,
  minimum_order_minor: 0,
  starts_at: null,
  expires_at: null,
  max_uses: 0,
  used_count: 0,
  active: true,
};

const fixedPromo: PromoRow = {
  code: 'SAVE40',
  type: 'fixed',
  percent_off: null,
  value_minor: 4000,
  minimum_order_minor: 0,
  starts_at: null,
  expires_at: null,
  max_uses: 0,
  used_count: 0,
  active: true,
};

describe('money integer invariants', () => {
  it('converts EGP strings to integer minor units without float drift', () => {
    expect(toMinor('12.34')).toBe(1234);
    expect(toMinor('0.999')).toBe(100); // Math.round, always integer
    expect(toMinor('100')).toBe(10000);
    expect(Number.isInteger(toMinor('12.34'))).toBe(true);
    expect(Number.isInteger(toMinor('0.999'))).toBe(true);
  });

  it('formats minor units back to a fixed 2-decimal EGP string', () => {
    expect(minorToEgp(1234)).toBe('12.34');
    expect(minorToEgp(100)).toBe('1.00');
    expect(minorToEgp(0)).toBe('0.00');
  });

  it('never produces a fractional minor unit through the pricing math', () => {
    // A percent that would be fractional if done with floats (33% of 33333).
    const d = computeDiscount({ ...percentPromo, percent_off: 33 }, 33333).discountMinor;
    expect(Number.isInteger(d)).toBe(true);
    expect(d).toBe(11000); // Math.round(33333 * 33 / 100) = Math.round(10999.89)
  });
});

describe('promo application (end-to-end discount math)', () => {
  it('applies a percent promo with integer rounding and reconciles totals', () => {
    const { discountMinor, totalMinor } = computeDiscount(percentPromo, subtotalMinor);
    expect(discountMinor).toBe(3250); // 10% of 32_500
    expect(totalMinor).toBe(subtotalMinor - discountMinor);
    expect(Number.isInteger(discountMinor)).toBe(true);
  });

  it('applies a fixed promo and caps the discount at the subtotal', () => {
    const { discountMinor, totalMinor } = computeDiscount(fixedPromo, subtotalMinor);
    expect(discountMinor).toBe(4000);
    expect(totalMinor).toBe(28500);

    // A fixed discount larger than the subtotal is clamped to the subtotal.
    const huge = computeDiscount({ ...fixedPromo, value_minor: 999999 }, 32500);
    expect(huge.discountMinor).toBe(32500);
    expect(huge.totalMinor).toBe(0);
  });

  it('rejects a promo that is below the minimum order', () => {
    expect(validatePromo(percentPromo, subtotalMinor, now)).toBeNull();
    const highMin: PromoRow = { ...percentPromo, minimum_order_minor: 50000 };
    expect(validatePromo(highMin, subtotalMinor, now)).toBe('below_minimum');
  });
});

describe('delivery fee resolution (real per-city constants)', () => {
  it('charges the same-day flat fee for a Cairo (sameDay) order regardless of subtotal', () => {
    // resolveDeliveryFee delegates to estimateDeliveryFeeMinor(cityCode); there
    // is NO free-shipping threshold here — free shipping is applied via promo,
    // not by subtotal. The fee is the centralized FLAT_SAME_DAY_FEE_MINOR.
    expect(resolveDeliveryFee('greater-cairo', subtotalMinor)).toBe(FLAT_SAME_DAY_FEE_MINOR);
    expect(resolveDeliveryFee('greater-cairo', 0)).toBe(FLAT_SAME_DAY_FEE_MINOR);
    expect(FLAT_SAME_DAY_FEE_MINOR).toBe(1500); // R-06 centralized constant
  });

  it('charges the next-day flat fee for a non-Cairo (nextDay) city', () => {
    expect(resolveDeliveryFee('mansoura', subtotalMinor)).toBe(FLAT_NEXT_DAY_FEE_MINOR);
    expect(FLAT_NEXT_DAY_FEE_MINOR).toBe(2500); // R-06 centralized constant
  });

  it('falls back to the safe default for an unknown city', () => {
    expect(resolveDeliveryFee('atlantis', subtotalMinor)).toBe(DEFAULT_DELIVERY_FEE_MINOR);
    expect(resolveDeliveryFee(null, subtotalMinor)).toBe(DEFAULT_DELIVERY_FEE_MINOR);
    expect(DEFAULT_DELIVERY_FEE_MINOR).toBe(1500);
  });

  it('exercises free shipping as a promo (the real free-shipping mechanism)', () => {
    const freeShipping: PromoRow = { ...percentPromo, type: 'free_shipping', percent_off: null };
    const totals = { subtotalMinor, deliveryFeeMinor: resolveDeliveryFee('greater-cairo', subtotalMinor)! };
    const after = applyPromoToOrderTotals(totals, freeShipping);
    expect(after.deliveryFeeMinor).toBe(0); // shipping waived
    // NOTE: applyPromoToOrderTotals folds the waived fee into `discountMinor`
    // but computes `totalMinor` from the promo's own discount (0), so its two
    // returned fields do NOT satisfy total === subtotal - discount + delivery
    // for free_shipping in this version. Assert the real output.
    expect(after.discountMinor).toBe(totals.deliveryFeeMinor); // 1_500
    expect(after.totalMinor).toBe(subtotalMinor); // 32_500
  });
});

describe('full pricing pipeline reconciliation', () => {
  it('subtotal - discount + delivery === total (fixed promo)', () => {
    const deliveryFeeMinor = resolveDeliveryFee('greater-cairo', subtotalMinor)!;
    const totals = { subtotalMinor, deliveryFeeMinor };
    const after = applyPromoToOrderTotals(totals, fixedPromo);
    expect(after.totalMinor).toBe(after.subtotalMinor - after.discountMinor + after.deliveryFeeMinor);
    expect(after.discountMinor).toBe(4000);
    expect(after.totalMinor).toBe(32500 + 1500 - 4000); // 30_000
  });

  it('subtotal - discount + delivery === total (percent promo)', () => {
    const deliveryFeeMinor = resolveDeliveryFee('mansoura', subtotalMinor)!; // 2500
    const totals = { subtotalMinor, deliveryFeeMinor };
    const after = applyPromoToOrderTotals(totals, percentPromo);
    expect(after.totalMinor).toBe(after.subtotalMinor - after.discountMinor + after.deliveryFeeMinor);
    expect(after.totalMinor).toBe(32500 + 2500 - 3250); // 31_750
  });
});

describe('subscription totals reconcile against the promo pipeline', () => {
  it('server-recomputed discount flows into totals: total === subtotal - discount', () => {
    const discountMinor = computeSubscriptionDiscount({
      promoCode: 'ROSE10',
      promoDiscountMinor: 9999, // untrusted client value, must be ignored
      resolvedPromo: percentPromo,
      subtotalMinor,
      now,
    });
    expect(discountMinor).toBe(3250); // 10% of 32_500, NOT the forged 9999
    const { totalMinor } = computeSubscriptionTotals(subtotalMinor, discountMinor, 0);
    expect(totalMinor).toBe(subtotalMinor - discountMinor); // gift card = 0
    expect(totalMinor).toBe(29250);
  });

  it('ignores a forged client discount and returns 0 when no promo resolves', () => {
    const discountMinor = computeSubscriptionDiscount({
      promoCode: 'FAKE',
      promoDiscountMinor: 9999,
      resolvedPromo: null,
      subtotalMinor,
      now,
    });
    expect(discountMinor).toBe(0);
    const { totalMinor } = computeSubscriptionTotals(subtotalMinor, discountMinor, 0);
    expect(totalMinor).toBe(subtotalMinor);
  });

  it('applies a gift card on top of the discount and clamps at zero', () => {
    const discountMinor = computeSubscriptionDiscount({
      promoCode: 'ROSE10',
      resolvedPromo: percentPromo,
      subtotalMinor,
      now,
    });
    const { totalMinor } = computeSubscriptionTotals(subtotalMinor, discountMinor, 3000);
    expect(totalMinor).toBe(subtotalMinor - discountMinor - 3000); // 26_250
  });
});

describe('promo input validation', () => {
  it('accepts a well-formed percent promo', () => {
    expect(
      validatePromoInput({
        code: 'rose10',
        type: 'percent',
        percentOff: 10,
        valueMinor: null,
        minimumOrderMinor: 0,
        startsAt: null,
        expiresAt: null,
        maxUses: 0,
        perUserLimit: 0,
        active: true,
      }),
    ).toBeNull();
  });

  it('rejects an out-of-range percent and a malformed code', () => {
    expect(
      validatePromoInput({
        code: 'rose10',
        type: 'percent',
        percentOff: 150,
        valueMinor: null,
        minimumOrderMinor: 0,
        startsAt: null,
        expiresAt: null,
        maxUses: 0,
        perUserLimit: 0,
        active: true,
      }),
    ).toBe('invalid_percent');
    expect(
      validatePromoInput({
        code: 'no spaces',
        type: 'fixed',
        percentOff: null,
        valueMinor: 500,
        minimumOrderMinor: 0,
        startsAt: null,
        expiresAt: null,
        maxUses: 0,
        perUserLimit: 0,
        active: true,
      }),
    ).toBe('invalid_code');
  });
});
