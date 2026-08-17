export type PaymentStatus = 'pending' | 'payment_started' | 'paid' | 'payment_failed' | 'cancelled' | 'refunded';
export type FulfillmentStatus = 'confirmed' | 'preparing' | 'ready_for_delivery' | 'out_for_delivery' | 'delivered' | 'cancelled';

const paymentTransitions: Record<PaymentStatus, readonly PaymentStatus[]> = {
  pending: ['payment_started', 'cancelled'],
  payment_started: ['paid', 'payment_failed', 'cancelled'],
  paid: ['refunded'],
  payment_failed: ['cancelled', 'payment_started'],
  cancelled: [],
  refunded: [],
};

const fulfillmentTransitions: Record<FulfillmentStatus, readonly FulfillmentStatus[]> = {
  confirmed: ['preparing', 'cancelled'],
  preparing: ['ready_for_delivery', 'cancelled'],
  ready_for_delivery: ['out_for_delivery', 'cancelled'],
  out_for_delivery: ['delivered'],
  delivered: [],
  cancelled: [],
};

export function canTransitionPayment(from: PaymentStatus, to: PaymentStatus) {
  return paymentTransitions[from].includes(to);
}

export function canTransitionFulfillment(from: FulfillmentStatus, to: FulfillmentStatus) {
  return fulfillmentTransitions[from].includes(to);
}
