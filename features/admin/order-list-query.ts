import type { FulfillmentStatus, PaymentStatus } from '@/features/commerce/order-state';

export type OrderListParams = { q?: string; payment?: string; fulfillment?: string };
export type OrderListConstraints = { search?: string; paymentStatus?: PaymentStatus; fulfillmentStatus?: FulfillmentStatus };

const paymentStatuses = new Set<PaymentStatus>(['pending', 'payment_started', 'paid', 'payment_failed', 'cancelled', 'refunded']);
const fulfillmentStatuses = new Set<FulfillmentStatus>(['confirmed', 'preparing', 'ready_for_delivery', 'out_for_delivery', 'delivered', 'cancelled']);

export function buildOrderListQuery(params: OrderListParams): OrderListConstraints {
  const constraints: OrderListConstraints = {};
  const search = params.q?.trim();
  if (search) constraints.search = search;
  if (params.payment && paymentStatuses.has(params.payment as PaymentStatus)) constraints.paymentStatus = params.payment as PaymentStatus;
  if (params.fulfillment && fulfillmentStatuses.has(params.fulfillment as FulfillmentStatus)) constraints.fulfillmentStatus = params.fulfillment as FulfillmentStatus;
  return constraints;
}