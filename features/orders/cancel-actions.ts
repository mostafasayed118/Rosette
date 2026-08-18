import type { CancelEligibility } from './cancel-request';
import { canRequestCancellation, requiresReview } from './cancel-request';
import { deliverOrderNotification } from '@/features/notifications/notification-delivery';
import type { AdminIdentity } from '@/features/admin/authorization';
import { canTransitionFulfillment, type FulfillmentStatus } from '@/features/commerce/order-state';

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
        }, deps.deliver as never);
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

export type ReviewCancellationResult =
  | { status: 'approved' }
  | { status: 'rejected' }
  | { status: 'not_found' }
  | { status: 'not_cancellable' }
  | { status: 'failure' };

export async function reviewCancellationRequest(
  client: CancelClient,
  input: { admin: AdminIdentity; requestId: string; action: 'approve' | 'reject'; reason?: string; orderUrlBase: string },
  deps: { deliver?: typeof deliverOrderNotification } = {},
): Promise<ReviewCancellationResult> {
  const deliver = deps.deliver ?? deliverOrderNotification;
  try {
    const { data } = await client.from('order_cancel_requests').select(`*,orders(${orderSelect})`).eq('id', input.requestId).maybeSingle();
    if (!data || !data.orders) return { status: 'not_found' };
    const request = data as { id: string; status: string; reason: string | null; orders: OrderRow };
    const order = request.orders;
    if (request.status !== 'pending') return { status: 'not_cancellable' };
    const reason = input.reason?.trim() || null;
    const now = new Date().toISOString();
    const emailBase = {
      orderId: order.id,
      recipient: order.customer_email ?? '',
      locale: order.locale,
      orderNumber: order.display_number,
      totalMinor: order.total_minor,
      subtotalMinor: order.subtotal_minor,
      deliveryFeeMinor: order.delivery_fee_minor,
      discountMinor: order.discount_minor ?? undefined,
      orderUrl: `${input.orderUrlBase.replace(/\/$/, '')}/orders/${order.id}?token=${encodeURIComponent(order.public_token ?? '')}`,
    };

    if (input.action === 'reject') {
      const { error } = await client.from('order_cancel_requests').update({ status: 'rejected', reason, reviewed_by: input.admin.userId, reviewed_at: now }).eq('id', input.requestId);
      if (error) return { status: 'failure' };
      await client.from('order_events').insert({ order_id: order.id, actor_id: input.admin.userId, event_type: 'cancel_rejected', from_status: null, to_status: null });
      await client.from('admin_audit_logs').insert({ actor_id: input.admin.userId, action: 'reject_cancellation', target_type: 'order', target_id: order.id, metadata: { request_id: input.requestId, reason } });
      if (order.customer_email) await deliver(client, { ...emailBase, type: 'cancel_rejected' }, deps.deliver as never);
      return { status: 'rejected' };
    }

    if (!canTransitionFulfillment(order.fulfillment_status as FulfillmentStatus, 'cancelled')) return { status: 'not_cancellable' };
    const { error: requestError } = await client.from('order_cancel_requests').update({ status: 'approved', reason, reviewed_by: input.admin.userId, reviewed_at: now }).eq('id', input.requestId);
    const { error: orderError } = await client.from('orders').update({ fulfillment_status: 'cancelled', payment_status: order.payment_status === 'paid' ? 'refunded' : 'cancelled', updated_at: now }).eq('id', order.id);
    if (requestError || orderError) return { status: 'failure' };
    await client.from('order_events').insert({ order_id: order.id, actor_id: input.admin.userId, event_type: 'cancelled', from_status: order.fulfillment_status, to_status: 'cancelled' });
    await client.from('admin_audit_logs').insert({ actor_id: input.admin.userId, action: 'approve_cancellation', target_type: 'order', target_id: order.id, metadata: { request_id: input.requestId } });
    if (order.customer_email) await deliver(client, { ...emailBase, type: 'cancel_approved' }, deps.deliver as never);
    return { status: 'approved' };
  } catch {
    return { status: 'failure' };
  }
}
