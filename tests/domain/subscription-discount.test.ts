import { describe, expect, it } from 'vitest';
import { validateSubscriptionCheckout } from '@/features/subscriptions/validation';
import { computeSubscriptionDiscount, computeSubscriptionTotals } from '@/features/subscriptions/service';
import type { PromoRow } from '@/features/promo/apply';
import type { Plan } from '@/features/subscriptions/types';

const now = new Date('2026-09-01T12:00:00Z');

const plan: Plan = {
  id: 'plan_1', slug: 'weekly-blooms', nameEn: 'Weekly Blooms', nameAr: '', nameFr: '',
  descriptionEn: '', descriptionAr: '', descriptionFr: '',
  frequencies: ['weekly'], bundlePrices: [{ deliveries: 4, priceMinor: 1000 }],
  productId: 'prod_1', active: true, sortOrder: 1,
};

function baseInput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    frequency: 'weekly',
    bundleSize: 4,
    recipientName: 'Fatma',
    recipientPhone: '1001112222',
    deliveryAddress: '12 Garden St',
    cityCode: 'CAI',
    deliveryWindow: 'morning',
    deliveryDate: '2030-01-15',
    ...overrides,
  };
}

const percentPromo: PromoRow = {
  code: 'ROSE10', type: 'percent', percent_off: 10, value_minor: null, minimum_order_minor: 0,
  starts_at: null, expires_at: null, max_uses: 0, used_count: 0, active: true,
};

describe('validateSubscriptionCheckout does not use client promoDiscountMinor', () => {
  it('returns identical totals regardless of promoDiscountMinor (R-01)', () => {
    const without = validateSubscriptionCheckout(plan, baseInput(), now);
    const withForged = validateSubscriptionCheckout(plan, baseInput({ promoDiscountMinor: 1000 }), now);
    if (!without.ok || !withForged.ok) throw new Error('expected validation to pass');
    expect(withForged.value.priceMinor).toBe(without.value.priceMinor);
    // total-relevant fields must not change with a forged discount
    expect(JSON.stringify(withForged.value)).toBe(JSON.stringify(without.value));
  });
});

describe('computeSubscriptionDiscount (R-01 server-side recompute)', () => {
  it('ignores a forged client promoDiscountMinor when no promo is resolved', () => {
    const discount = computeSubscriptionDiscount({
      promoCode: 'FAKE',
      promoDiscountMinor: 9999, // attacker tries to zero out the price
      resolvedPromo: null,
      subtotalMinor: 1000,
      now,
    });
    expect(discount).toBe(0);
  });

  it('returns 0 when no promoCode is supplied', () => {
    const discount = computeSubscriptionDiscount({
      promoCode: undefined,
      promoDiscountMinor: 9999,
      resolvedPromo: null,
      subtotalMinor: 1000,
      now,
    });
    expect(discount).toBe(0);
  });

  it('applies a validated promo discount only from the server-resolved promo', () => {
    const discount = computeSubscriptionDiscount({
      promoCode: 'ROSE10',
      promoDiscountMinor: 0, // client claims no discount; server recomputes
      resolvedPromo: percentPromo,
      subtotalMinor: 1000,
      now,
    });
    expect(discount).toBe(100); // 10% of 1000
  });

  it('returns 0 when the resolved promo fails validation', () => {
    const expired: PromoRow = { ...percentPromo, active: false };
    const discount = computeSubscriptionDiscount({
      promoCode: 'ROSE10',
      promoDiscountMinor: 100,
      resolvedPromo: expired,
      subtotalMinor: 1000,
      now,
    });
    expect(discount).toBe(0);
  });
});

describe('computeSubscriptionTotals (R-01 total integrity)', () => {
  it('with a forged discount, total equals subtotal minus gift card', () => {
    const { discountMinor, totalMinor } = computeSubscriptionTotals(1000, 0, 200);
    expect(discountMinor).toBe(0);
    expect(totalMinor).toBe(800); // 1000 - 0 - 200
  });

  it('clamps discount to subtotal and applies gift card', () => {
    const { discountMinor, totalMinor } = computeSubscriptionTotals(1000, 500, 100);
    expect(discountMinor).toBe(500);
    expect(totalMinor).toBe(400); // 1000 - 500 - 100
  });
});
