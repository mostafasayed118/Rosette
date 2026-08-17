import { canTransitionFulfillment } from '@/features/commerce/order-state';
import type { FulfillmentStatus } from '@/features/commerce/order-state';

export type AdminRole = 'admin' | 'operator';
export type AdminIdentity = { userId: string; role: AdminRole };

export function canUpdateOrderStatus(role: AdminRole, from: FulfillmentStatus, to: FulfillmentStatus) {
  if (!canTransitionFulfillment(from, to)) return false;
  if (role === 'operator') return to === 'preparing' || to === 'ready_for_delivery' || to === 'out_for_delivery' || to === 'delivered';
  return true;
}
