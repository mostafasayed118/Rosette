import type { FulfillmentStatus } from '@/features/commerce/order-state';

export const FULFILLMENT_STEPS: FulfillmentStatus[] = ['confirmed', 'preparing', 'ready_for_delivery', 'out_for_delivery', 'delivered'];

export const FULFILLMENT_STEP_KEYS: Record<string, string> = {
  confirmed: 'orderConfirmed',
  preparing: 'preparing',
  ready_for_delivery: 'statusReadyForDelivery',
  out_for_delivery: 'statusOutForDelivery',
  delivered: 'statusDelivered',
};

/**
 * The index of the step currently in progress. Steps before it are complete,
 * the step itself is "current", steps after it are pending.
 * - `cancelled` → -1 (no journey to show).
 * - `delivered` → `FULFILLMENT_STEPS.length` (every step is complete; none current).
 */
export function fulfillmentStepIndex(status: FulfillmentStatus): number {
  if (status === 'cancelled') return -1;
  if (status === 'delivered') return FULFILLMENT_STEPS.length;
  return FULFILLMENT_STEPS.indexOf(status);
}
