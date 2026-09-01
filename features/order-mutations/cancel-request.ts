export type CancelEligibility = 'ok' | 'not_found' | 'already_cancelled' | 'delivered' | 'refunded' | 'request_pending';

export function canRequestCancellation(order: { fulfillmentStatus: string; paymentStatus: string; hasPendingRequest: boolean } | null): CancelEligibility {
  if (!order) return 'not_found';
  if (order.hasPendingRequest) return 'request_pending';
  if (order.fulfillmentStatus === 'cancelled') return 'already_cancelled';
  if (order.fulfillmentStatus === 'delivered') return 'delivered';
  if (order.paymentStatus === 'refunded') return 'refunded';
  return 'ok';
}

export function requiresReview(order: { fulfillmentStatus: string; paymentStatus: string }): boolean {
  return order.paymentStatus === 'paid' || order.fulfillmentStatus !== 'confirmed';
}
