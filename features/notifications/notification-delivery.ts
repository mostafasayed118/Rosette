import { sendOrderNotification } from './notification-service';
import type { EmailLocale, NotificationType } from './email-types';

export type DeliveryClient = { from: (table: string) => any };

export type DeliverNotificationInput = {
  orderId: string;
  type: NotificationType;
  recipient: string;
  locale: EmailLocale;
  orderNumber: string;
  totalMinor: number;
  subtotalMinor?: number;
  deliveryFeeMinor?: number;
  discountMinor?: number;
  orderUrl: string;
};

/**
 * Best-effort transactional email delivery: record a pending `notification_deliveries`
 * row, send through the mail transport, then mark the row sent/failed. Never throws —
 * a failed email must not break the order/status mutation it accompanies.
 */
export async function deliverOrderNotification(
  client: DeliveryClient,
  input: DeliverNotificationInput,
  sendNotification: typeof sendOrderNotification = sendOrderNotification,
): Promise<{ accepted: boolean }> {
  if (!input.recipient) return { accepted: false };
  const { data: row, error } = await client
    .from('notification_deliveries')
    .insert({ order_id: input.orderId, type: input.type, recipient: input.recipient, locale: input.locale, status: 'pending' })
    .select('id')
    .single();
  if (error || !row) return { accepted: false };

  const result = await sendNotification({
    locale: input.locale,
    type: input.type,
    orderNumber: input.orderNumber,
    totalMinor: input.totalMinor,
    subtotalMinor: input.subtotalMinor,
    deliveryFeeMinor: input.deliveryFeeMinor,
    discountMinor: input.discountMinor,
    recipientEmail: input.recipient,
    orderUrl: input.orderUrl,
  });

  if ('skipped' in result && result.skipped) {
    await client.from('notification_deliveries').update({ status: 'skipped', last_error: 'delivery_disabled' }).eq('id', row.id);
    return { accepted: false };
  }

  await client
    .from('notification_deliveries')
    .update(result.accepted ? { status: 'sent', sent_at: new Date().toISOString() } : { status: 'failed', attempts: 1, last_error: 'smtp_failed' })
    .eq('id', row.id);

  return { accepted: result.accepted };
}
