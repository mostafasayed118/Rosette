import type { CancelEligibility } from './cancel-request';
import { canRequestCancellation, requiresReview } from './cancel-request';
import { deliverOrderNotification } from '@/features/notifications/notification-delivery';
import type { AdminIdentity } from '@/features/admin/authorization';

type CancelClient = { from: (table: string) => any };

const orderSelect = 'id,display_number,fulfillment_status,payment_status,customer_id,customer_email,locale,total_minor,subtotal_minor,delivery_fee_minor,discount_minor,public_token';

type OrderRow = {
  id: string; display_number: string; fulfillment_status: string; payment_status: string;
  customer_id: string | null; customer_email: string | null; locale: 'en' | 'ar' | 'fr';
  total_minor: number; subtotal_minor: number; delivery_fee_minor: number; discount_minor: number | null;
  public_token: string | null;
};

export type RequestCancellationResult =
  | { status: 'auto_cancelled' }
  | { status: 'created'; requestId: string }
  | { status: 'ineligible'; reason: Exclude<CancelEligibility, 'ok'> }
  | { status: 'not_found' }
  | { status: 'failure' };

export async function requestCancellation(
  client: CancelClient,
  input: { customerId: string; orderId: string; reason?: string },
  deps: { deliver?: typeof deliverOrderNotification; orderUrlBase?: string } = {},
): Promise<RequestCancellationResult> {
  const deliver = deps.deliver ?? deliverOrderNotification;
  try {
    const { data } = await client.from('orders').select(orderSelect).eq('id', input.orderId).eq('customer_id', input.customerId).maybeSingle();
    if (!data) return { status: 'not_found' };
    const order = data as OrderRow;

    const { data: pending } = await client.from('order_cancel_requests').select('id').eq('order_id', input.orderId).eq('status', 'pending').maybeSingle();
    const eligibility = canRequestCancellation({
      fulfillmentStatus: order.fulfillment_status,
      paymentStatus: order.payment_status,
      hasPendingRequest: Boolean(pending),
    });
    if (eligibility !== 'ok') return { status: 'ineligible', reason: eligibility };

    const reason = input.reason?.trim() || null;
    const now = new Date().toISOString();

    if (!requiresReview({ fulfillmentStatus: order.fulfillment_status, paymentStatus: order.payment_status })) {
      const { error } = await client.from('orders').update({ fulfillment_status: 'cancelled', payment_status: 'cancelled', updated_at: now }).eq('id', order.id);
      if (error) return { status: 'failure' };
      await client.from('order_events').insert({ order_id: order.id, actor_id: input.customerId, event_type: 'cancelled', from_status: order.fulfillment_status, to_status: 'cancelled' });
      if (order.customer_email) {
        await deliver(client, {
          orderId: order.id,
          type: 'cancel_approved',
          recipient: order.customer_email,
          locale: order.locale,
          orderNumber: order.display_number,
          totalMinor: order.total_minor,
          subtotalMinor: order.subtotal_minor,
          deliveryFeeMinor: order.delivery_fee_minor,
          discountMinor: order.discount_minor ?? undefined,
          orderUrl: `${(deps.orderUrlBase ?? '').replace(/\/$/, '')}/orders/${order.id}?token=${encodeURIComponent(order.public_token ?? '')}`,
        }, deps.deliver);
      }
      return { status: 'auto_cancelled' };
    }

    const { data: created, error: insertError } = await client.from('order_cancel_requests').insert({ order_id: order.id, customer_id: input.customerId, status: 'pending', reason }).select('id').single();
    if (insertError || !created) return { status: 'failure' };
    await client.from('order_events').insert({ order_id: order.id, actor_id: input.customerId, event_type: 'cancel_requested', from_status: null, to_status: null });
    return { status: 'created', requestId: String(created.id) };
  } catch {
    return { status: 'failure' };
  }
}
