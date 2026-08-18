import type { FulfillmentStatus } from '@/features/commerce/order-state';
import type { NotificationType } from '@/features/notifications/email-types';
import { sendOrderNotification } from '@/features/notifications/notification-service';
import { deliverOrderNotification } from '@/features/notifications/notification-delivery';
import { canUpdateOrderStatus } from './authorization';
import type { AdminIdentity } from './authorization';

export type UpdateStatusResult = 'updated' | 'missing_order' | 'invalid_or_unauthorized' | 'failure';

type OrderRow = { id: string; display_number: string; total_minor: number; subtotal_minor: number; delivery_fee_minor: number; discount_minor: number | null; public_token: string; customer_email: string | null; locale: 'en' | 'ar' | 'fr'; fulfillment_status: FulfillmentStatus };

type OrderActionsClient = { from: (table: string) => any };

const MILESTONE_NOTIFICATIONS: Partial<Record<FulfillmentStatus, NotificationType>> = {
  ready_for_delivery: 'ready_for_delivery',
  out_for_delivery: 'out_for_delivery',
  delivered: 'delivered',
};

const orderSelect = 'id,display_number,total_minor,subtotal_minor,delivery_fee_minor,discount_minor,public_token,customer_email,locale,fulfillment_status';

export async function updateFulfillmentStatus(
  client: OrderActionsClient,
  input: { admin: AdminIdentity; orderId: string; status: FulfillmentStatus; orderUrlBase: string },
  deps: { sendNotification?: typeof sendOrderNotification } = {},
): Promise<UpdateStatusResult> {
  const sendNotification = deps.sendNotification ?? sendOrderNotification;
  const { data } = await client.from('orders').select(orderSelect).eq('id', input.orderId).maybeSingle();
  if (!data) return 'missing_order';
  const order = data as OrderRow;
  if (!canUpdateOrderStatus(input.admin.role, order.fulfillment_status, input.status)) return 'invalid_or_unauthorized';

  const { error } = await client.from('orders').update({ fulfillment_status: input.status, updated_at: new Date().toISOString() }).eq('id', input.orderId);
  if (error) return 'failure';

  await client.from('order_events').insert({ order_id: input.orderId, actor_id: input.admin.userId, event_type: 'fulfillment_status_changed', from_status: order.fulfillment_status, to_status: input.status });
  await client.from('admin_audit_logs').insert({ actor_id: input.admin.userId, action: 'update_order_status', target_type: 'order', target_id: input.orderId, metadata: { status: input.status } });

  const milestoneType = MILESTONE_NOTIFICATIONS[input.status];
  if (milestoneType && order.customer_email) {
    await deliverOrderNotification(client, {
      orderId: input.orderId,
      type: milestoneType,
      recipient: order.customer_email,
      locale: order.locale,
      orderNumber: order.display_number,
      totalMinor: order.total_minor,
      subtotalMinor: order.subtotal_minor,
      deliveryFeeMinor: order.delivery_fee_minor,
      discountMinor: order.discount_minor ?? undefined,
      orderUrl: `${input.orderUrlBase}/orders/${input.orderId}?token=${encodeURIComponent(order.public_token)}`,
    }, sendNotification);
  }
  return 'updated';
}