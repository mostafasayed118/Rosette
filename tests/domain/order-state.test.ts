import { describe, expect, it } from 'vitest';
import { canTransitionPayment, canTransitionFulfillment } from '@/features/commerce/order-state';

describe('order state transitions', () => {
  it('allows payment_started to become paid', () => {
    expect(canTransitionPayment('payment_started', 'paid')).toBe(true);
  });

  it('rejects paid to pending transitions', () => {
    expect(canTransitionPayment('paid', 'pending')).toBe(false);
  });

  it('allows only valid fulfillment progression', () => {
    expect(canTransitionFulfillment('confirmed', 'preparing')).toBe(true);
    expect(canTransitionFulfillment('delivered', 'preparing')).toBe(false);
  });
});
