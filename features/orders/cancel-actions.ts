import type { CancelEligibility } from './cancel-request';
import { canRequestCancellation, requiresReview } from './cancel-request';
import { deliverOrderNotification } from '@/features/notifications/notification-delivery';
import type { AdminIdentity } from '@/features/admin/authorization';
import { canTransitionFulfillment, type FulfillmentStatus } from '@/features/commerce/order-state';
import { refundPaymobTransaction } from '@/features/payment/paymob-refund';
import { restoreGiftCardForCancelledOrder } from '@/features/gift-cards/service';
import type { PaymobRefundResult } from '@/features/payment/paymob-refund';
import { orderSelect } from '@/features/order/types';
import { deriveOrderStatus, type DeliveryGroup } from '@/features/order/delivery-groups';

type CancelClient = { from: (table: string) => any; rpc?: (name: string, args: Record<string, unknown>) => any };

type OrderRow = {
  id: string; display_number: string; fulfillment_status: string; payment_status: string;
  customer_id: string | null; customer_email: string | null; locale: 'en' | 'ar' | 'fr';
  total_minor: number; subtotal_minor: number; delivery_fee_minor: number; discount_minor: number | null;
  public_token: string | null;
  gift_card_id?: string | null; gift_card_minor?: number | null; gift_card_hold_id?: string | null;
  payments?: Array<{ id: string; provider_reference: string | null; amount_minor: number; status: string }>;
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
  | { status: 'refund_failed' }
  | { status: 'failure' };

export async function reviewCancellationRequest(
  client: CancelClient,
  input: { admin: AdminIdentity; requestId: string; action: 'approve' | 'reject'; reason?: string; orderUrlBase: string },
  deps: { deliver?: typeof deliverOrderNotification; refund?: typeof refundPaymobTransaction } = {},
): Promise<ReviewCancellationResult> {
  const deliver = deps.deliver ?? deliverOrderNotification;
  const refund: typeof refundPaymobTransaction = deps.refund ?? refundPaymobTransaction;
  try {
    const { data } = await client.from('order_cancel_requests').select(`*,orders(${orderSelect},payments(id,provider_reference,amount_minor,status))`).eq('id', input.requestId).maybeSingle();
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

    const giftCardRestore = await restoreGiftCardForCancelledOrder(client, { orderId: order.id, giftCardId: order.gift_card_id, amountMinor: order.gift_card_minor ?? undefined });
    if (giftCardRestore === 'failure') return { status: 'refund_failed' };

    // Block-approval: a paid order is only approved once Paymob has actually refunded the
    // money. On any refund problem the request stays pending and the order stays paid so
    // the admin can retry — the DB never claims a refund that did not happen.
    if (order.payment_status === 'paid' && order.total_minor > 0) {
      const payment = (order.payments ?? []).find((row) => row.status === 'paid' || row.status === 'refunded');
      if (!payment?.provider_reference) return { status: 'refund_failed' };
      if (payment.status === 'paid') {
        const refundResult: PaymobRefundResult = await refund({ transactionId: payment.provider_reference, amountMinor: payment.amount_minor });
        if (!refundResult.ok) return { status: 'refund_failed' };
        const { error: paymentError } = await client.from('payments').update({ status: 'refunded', raw_event: { refund: { transaction_id: refundResult.refundTransactionId, at: now } } }).eq('id', payment.id);
        if (paymentError) return { status: 'failure' };
      }
    }

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

export function groupRefundForCancellation(
  group: { itemsMinor: number; feeMinor: number },
  order: { totalMinor: number; giftCardMinor: number; refundedSoFar: number },
): { amountMinor: number; closesOrder: boolean } {
  const cashPaid = order.totalMinor - order.giftCardMinor;
  const requested = group.itemsMinor + group.feeMinor;
  const remaining = cashPaid - order.refundedSoFar;
  const amountMinor = Math.min(requested, Math.max(0, remaining));
  const closesOrder = remaining <= 0 || amountMinor >= remaining;
  return { amountMinor, closesOrder };
}

async function refundedSoFarFor(client: CancelClient, orderId: string): Promise<number> {
  const { data } = await client.from('order_events').select('metadata').eq('order_id', orderId).eq('event_type', 'group_cancelled');
  return (((data ?? []) as Array<{ metadata: { refund_minor?: number } | null }>).reduce((sum, row) => sum + (row.metadata?.refund_minor ?? 0), 0));
}

async function groupItemsMinorFor(client: CancelClient, groupId: string): Promise<number> {
  const { data } = await client.from('order_items').select('unit_price_minor,quantity').eq('delivery_group_id', groupId);
  return (((data ?? []) as Array<{ unit_price_minor: number; quantity: number }>).reduce((sum, row) => sum + row.unit_price_minor * row.quantity, 0));
}

async function recomputeDerivedOrderStatus(client: CancelClient, orderId: string): Promise<DeliveryGroup[] | null> {
  const { data: groups } = await client.from('order_delivery_groups').select('id,position,recipient_name,recipient_phone,delivery_address,delivery_date,delivery_window,delivery_fee_minor,fulfillment_status,public_token,cancelled_at').eq('order_id', orderId).order('position', { ascending: true });
  if (!groups || !(groups as unknown[]).length) return null;
  const derived = deriveOrderStatus((groups as Array<{ fulfillment_status: string }>).map((g) => ({ fulfillmentStatus: g.fulfillment_status as FulfillmentStatus })));
  await client.from('orders').update({ fulfillment_status: derived, updated_at: new Date().toISOString() }).eq('id', orderId);
  return groups as unknown as DeliveryGroup[];
}

export async function requestGroupCancellation(
  client: CancelClient,
  input: { customerId: string; orderId: string; groupId: string; reason?: string },
  deps: { deliver?: typeof deliverOrderNotification; orderUrlBase?: string } = {},
): Promise<RequestCancellationResult> {
  const deliver = deps.deliver ?? deliverOrderNotification;
  try {
    const { data } = await client.from('orders').select(orderSelect).eq('id', input.orderId).eq('customer_id', input.customerId).maybeSingle();
    if (!data) return { status: 'not_found' };
    const order = data as OrderRow;
    const { data: group } = await client.from('order_delivery_groups').select('id,fulfillment_status').eq('id', input.groupId).eq('order_id', order.id).maybeSingle();
    if (!group) return { status: 'not_found' };
    const groupStatus = group.fulfillment_status as FulfillmentStatus;

    const { data: pending } = await client.from('order_cancel_requests').select('id').eq('order_id', order.id).eq('delivery_group_id', input.groupId).eq('status', 'pending').maybeSingle();
    if (pending) return { status: 'ineligible', reason: 'request_pending' };
    if (groupStatus === 'cancelled') return { status: 'ineligible', reason: 'already_cancelled' };
    if (groupStatus === 'delivered') return { status: 'ineligible', reason: 'delivered' };

    const reason = input.reason?.trim() || null;
    const now = new Date().toISOString();

    if (!requiresReview({ fulfillmentStatus: groupStatus, paymentStatus: order.payment_status })) {
      const { error } = await client.from('order_delivery_groups').update({ fulfillment_status: 'cancelled', cancelled_at: now, updated_at: now }).eq('id', input.groupId);
      if (error) return { status: 'failure' };
      await client.from('order_events').insert({ order_id: order.id, actor_id: input.customerId, event_type: 'group_cancelled', from_status: groupStatus, to_status: 'cancelled', metadata: { delivery_group_id: input.groupId, refund_minor: 0 } });
      await recomputeDerivedOrderStatus(client, order.id);
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

    const { data: created, error: insertError } = await client.from('order_cancel_requests').insert({ order_id: order.id, customer_id: input.customerId, status: 'pending', reason, delivery_group_id: input.groupId }).select('id').single();
    if (insertError || !created) return { status: 'failure' };
    await client.from('order_events').insert({ order_id: order.id, actor_id: input.customerId, event_type: 'cancel_requested', from_status: null, to_status: null, metadata: { delivery_group_id: input.groupId } });
    return { status: 'created', requestId: String(created.id) };
  } catch {
    return { status: 'failure' };
  }
}

export async function reviewGroupCancellationRequest(
  client: CancelClient,
  input: { admin: AdminIdentity; requestId: string; action: 'approve' | 'reject'; reason?: string; orderUrlBase: string },
  deps: { deliver?: typeof deliverOrderNotification; refund?: typeof refundPaymobTransaction } = {},
): Promise<ReviewCancellationResult> {
  const deliver = deps.deliver ?? deliverOrderNotification;
  const refund: typeof refundPaymobTransaction = deps.refund ?? refundPaymobTransaction;
  try {
    const { data } = await client.from('order_cancel_requests').select(`delivery_group_id,*,orders(${orderSelect},payments(id,provider_reference,amount_minor,status))`).eq('id', input.requestId).maybeSingle();
    if (!data || !data.orders) return { status: 'not_found' };
    const request = data as { id: string; status: string; reason: string | null; delivery_group_id: string | null; orders: OrderRow };
    const order = request.orders;
    if (request.status !== 'pending') return { status: 'not_cancellable' };
    if (!request.delivery_group_id) return { status: 'not_cancellable' };
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
      await client.from('order_events').insert({ order_id: order.id, actor_id: input.admin.userId, event_type: 'cancel_rejected', from_status: null, to_status: null, metadata: { delivery_group_id: request.delivery_group_id } });
      await client.from('admin_audit_logs').insert({ actor_id: input.admin.userId, action: 'reject_cancellation', target_type: 'order', target_id: order.id, metadata: { request_id: input.requestId, delivery_group_id: request.delivery_group_id, reason } });
      if (order.customer_email) await deliver(client, { ...emailBase, type: 'cancel_rejected' }, deps.deliver as never);
      return { status: 'rejected' };
    }

    const { data: group } = await client.from('order_delivery_groups').select('id,fulfillment_status,delivery_fee_minor').eq('id', request.delivery_group_id).maybeSingle();
    if (!group) return { status: 'not_found' };
    const groupStatus = group.fulfillment_status as FulfillmentStatus;
    if (!canTransitionFulfillment(groupStatus, 'cancelled')) return { status: 'not_cancellable' };

    const itemsMinor = await groupItemsMinorFor(client, request.delivery_group_id);
    const refundedSoFar = await refundedSoFarFor(client, order.id);
    const settle = groupRefundForCancellation(
      { itemsMinor, feeMinor: group.delivery_fee_minor ?? 0 },
      { totalMinor: order.total_minor, giftCardMinor: order.gift_card_minor ?? 0, refundedSoFar },
    );

    // Full settle: the last non-cancelled group empties the cash paid, so the
    // gift card is restored per the full-cancel rules before refunding cash.
    if (settle.closesOrder && order.gift_card_id) {
      const giftCardRestore = await restoreGiftCardForCancelledOrder(client, { orderId: order.id, giftCardId: order.gift_card_id, amountMinor: order.gift_card_minor ?? undefined });
      if (giftCardRestore === 'failure') return { status: 'refund_failed' };
    }

    if (order.payment_status === 'paid' && settle.amountMinor > 0) {
      const payment = (order.payments ?? []).find((row) => row.status === 'paid' || row.status === 'refunded');
      if (!payment?.provider_reference) return { status: 'refund_failed' };
      if (payment.status === 'paid') {
        const refundResult: PaymobRefundResult = await refund({ transactionId: payment.provider_reference, amountMinor: settle.amountMinor });
        if (!refundResult.ok) return { status: 'refund_failed' };
        const { error: paymentError } = await client.from('payments').update({ status: settle.closesOrder ? 'refunded' : 'paid', raw_event: { refund: { transaction_id: refundResult.refundTransactionId, amount_minor: settle.amountMinor, at: now } } }).eq('id', payment.id);
        if (paymentError) return { status: 'failure' };
      }
    }

    const { error: groupError } = await client.from('order_delivery_groups').update({ fulfillment_status: 'cancelled', cancelled_at: now, updated_at: now }).eq('id', request.delivery_group_id);
    if (groupError) return { status: 'failure' };
    await client.from('order_events').insert({ order_id: order.id, actor_id: input.admin.userId, event_type: 'group_cancelled', from_status: groupStatus, to_status: 'cancelled', metadata: { delivery_group_id: request.delivery_group_id, refund_minor: settle.amountMinor } });

    if (settle.closesOrder) {
      const { error: requestError } = await client.from('order_cancel_requests').update({ status: 'approved', reason, reviewed_by: input.admin.userId, reviewed_at: now }).eq('id', input.requestId);
      const { error: orderError } = await client.from('orders').update({ fulfillment_status: 'cancelled', payment_status: order.payment_status === 'paid' ? 'refunded' : 'cancelled', updated_at: now }).eq('id', order.id);
      if (requestError || orderError) return { status: 'failure' };
      await client.from('order_events').insert({ order_id: order.id, actor_id: input.admin.userId, event_type: 'cancelled', from_status: order.fulfillment_status, to_status: 'cancelled' });
    } else {
      await recomputeDerivedOrderStatus(client, order.id);
      const { error: requestError } = await client.from('order_cancel_requests').update({ status: 'approved', reason, reviewed_by: input.admin.userId, reviewed_at: now }).eq('id', input.requestId);
      if (requestError) return { status: 'failure' };
    }
    await client.from('admin_audit_logs').insert({ actor_id: input.admin.userId, action: 'approve_group_cancellation', target_type: 'order', target_id: order.id, metadata: { request_id: input.requestId, delivery_group_id: request.delivery_group_id, refund_minor: settle.amountMinor } });
    if (order.customer_email) await deliver(client, { ...emailBase, type: 'cancel_approved' }, deps.deliver as never);
    return { status: 'approved' };
  } catch {
    return { status: 'failure' };
  }
}
