import type { FulfillmentStatus } from '@/features/commerce/order-state';
import type { NotificationType } from '@/features/notifications/email-types';
import { sendOrderNotification } from '@/features/notifications/notification-service';
import { canUpdateOrderStatus } from './authorization';
import type { AdminIdentity } from './authorization';

export type UpdateStatusResult = 'updated' | 'missing_order' | 'invalid_or_unauthorized' | 'failure';

type OrderRow = { id: string; display_number: string; total_minor: number; public_token: string; customer_email: string | null; locale: 'en' | 'ar'; fulfillment_status: FulfillmentStatus };

type OrderActionsClient = { from: (table: string) => any };

const MILESTONE_STATUSES = new Set<FulfillmentStatus>(['out_for_delivery', 'delivered']);

const orderSelect = 'id,display_number,total_minor,public_token,customer_email,locale,fulfillment_status';

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

  if (MILESTONE_STATUSES.has(input.status) && order.customer_email) {
    await enqueueMilestoneEmail(client, order, input.status as 'out_for_delivery' | 'delivered', input.orderUrlBase, sendNotification);
  }
  return 'updated';
}

async function enqueueMilestoneEmail(
  client: OrderActionsClient,
  order: OrderRow,
  type: 'out_for_delivery' | 'delivered',
  orderUrlBase: string,
  sendNotification: typeof sendOrderNotification,
) {
  const { data: row, error } = await client.from('notification_deliveries').insert({ order_id: order.id, type, recipient: order.customer_email, locale: order.locale, status: 'pending' }).select('id').single();
  if (error || !row) return;
  const result = await sendNotification({
    locale: order.locale,
    type: type as NotificationType,
    orderNumber: order.display_number,
    totalMinor: order.total_minor,
    recipientEmail: order.customer_email as string,
    orderUrl: `${orderUrlBase}/orders/${order.id}?token=${encodeURIComponent(order.public_token)}`,
  });
  await client.from('notification_deliveries').update(result.accepted ? { status: 'sent', sent_at: new Date().toISOString() } : { status: 'failed', attempts: 1, last_error: 'smtp_failed' }).eq('id', row.id);
}