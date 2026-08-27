import { describe, expect, it } from 'vitest';
import { validateSubscriptionCheckout } from '@/features/subscriptions/validation';
import type { Plan } from '@/features/subscriptions/types';

const plan: Plan = {
  id: 'p1', slug: 'classic', nameEn: 'The Classic', nameAr: '', nameFr: '',
  descriptionEn: '', descriptionAr: '', descriptionFr: '',
  frequencies: ['weekly', 'biweekly'],
  bundlePrices: [{ deliveries: 4, priceMinor: 120000 }, { deliveries: 8, priceMinor: 220000 }],
  productId: 'prod1', active: true, sortOrder: 0,
};
const base = { slug: 'classic', frequency: 'weekly', bundleSize: 4, recipientName: 'Mom', recipientPhone: '+201000000', deliveryAddress: '12 Nile St', cityCode: 'cairo', deliveryWindow: 'Morning', deliveryDate: '2026-09-15', locale: 'en', giftMessage: '', promoCode: '', giftCardMinor: 0 };

describe('validateSubscriptionCheckout', () => {
  it('accepts a valid checkout', () => { expect(validateSubscriptionCheckout(plan, base, new Date('2026-09-13T00:00:00Z')).ok).toBe(true); });
  it('rejects an inactive plan', () => { expect(validateSubscriptionCheckout({ ...plan, active: false }, base, new Date('2026-09-13T00:00:00Z')).ok).toBe(false); });
  it('rejects an unoffered frequency', () => { expect(validateSubscriptionCheckout(plan, { ...base, frequency: 'monthly' }, new Date('2026-09-13T00:00:00Z')).ok).toBe(false); });
  it('rejects an unoffered bundle size', () => { expect(validateSubscriptionCheckout(plan, { ...base, bundleSize: 12 }, new Date('2026-09-13T00:00:00Z')).ok).toBe(false); });
  it('rejects a first delivery date inside the 1-day lead time', () => {
    // now = 2026-09-14; delivery must be >= 2026-09-15; 2026-09-14 is too soon
    expect(validateSubscriptionCheckout(plan, { ...base, deliveryDate: '2026-09-14' }, new Date('2026-09-14T00:00:00Z')).ok).toBe(false);
  });
});
