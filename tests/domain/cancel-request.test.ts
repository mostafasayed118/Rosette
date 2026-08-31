import { describe, expect, it } from 'vitest';
import { canRequestCancellation, requiresReview } from '@/features/order-mutations/cancel-request';

describe('canRequestCancellation', () => {
  const active = { fulfillmentStatus: 'confirmed', paymentStatus: 'pending', hasPendingRequest: false };

  it('is ok for an active, unpaid order without a pending request', () => {
    expect(canRequestCancellation(active)).toBe('ok');
  });

  it('reports not_found for a missing order', () => {
    expect(canRequestCancellation(null)).toBe('not_found');
  });

  it('reports already_cancelled, delivered, refunded, and request_pending', () => {
    expect(canRequestCancellation({ ...active, fulfillmentStatus: 'cancelled' })).toBe('already_cancelled');
    expect(canRequestCancellation({ ...active, fulfillmentStatus: 'delivered' })).toBe('delivered');
    expect(canRequestCancellation({ ...active, paymentStatus: 'refunded' })).toBe('refunded');
    expect(canRequestCancellation({ ...active, hasPendingRequest: true })).toBe('request_pending');
  });
});

describe('requiresReview', () => {
  it('is false only when confirmed and not paid', () => {
    expect(requiresReview({ fulfillmentStatus: 'confirmed', paymentStatus: 'pending' })).toBe(false);
    expect(requiresReview({ fulfillmentStatus: 'confirmed', paymentStatus: 'payment_failed' })).toBe(false);
  });

  it('is true when payment is captured or fulfillment has started', () => {
    expect(requiresReview({ fulfillmentStatus: 'confirmed', paymentStatus: 'paid' })).toBe(true);
    expect(requiresReview({ fulfillmentStatus: 'preparing', paymentStatus: 'pending' })).toBe(true);
    expect(requiresReview({ fulfillmentStatus: 'out_for_delivery', paymentStatus: 'paid' })).toBe(true);
  });
});
