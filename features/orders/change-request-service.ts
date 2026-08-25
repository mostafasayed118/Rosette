import { canRequestChange, requiresReview, parseChangeRequestDiff, applyChanges, type ChangeRequestDiff, type ChangeEligibility } from './change-request';
import { deliverOrderNotification } from '@/features/notifications/notification-delivery';
import type { AdminIdentity } from '@/features/admin/authorization';
import { refundPaymobTransaction, type PaymobRefundResult } from '@/features/payment/paymob-refund';
import { createPaymobIntention } from '@/features/payment/paymob-client';
import { getRequiredServerEnv } from '@/lib/server-env';
import type { CreatePaymentInput } from '@/features/payment/paymob-client';
import { orderSelect, orderSelectWithItemsAndPayments } from '@/features/order/types';

type ChangeClient = { from: (table: string) => any; rpc?: (name: string, args: Record<string, unknown>) => unknown };

const fullSelect = orderSelectWithItemsAndPayments;

type OrderRow = {
  id: string; display_number: string; fulfillment_status: string; payment_status: string;
  customer_id: string | null; customer_email: string | null; locale: 'en' | 'ar' | 'fr';
  total_minor: number; subtotal_minor: number; delivery_fee_minor: number; discount_minor: number | null;
  public_token: string | null; recipient_name: string; recipient_phone: string; delivery_address: string;
  delivery_date: string; delivery_window: string;
  payments?: Array<{ id: string; provider_reference: string | null; amount_minor: number; status: string }>;
  items: Array<{ id: string; unit_price_minor: number; quantity: number; gift_message: string }>;
};

function normalizeOrder(data: Record<string, any>): OrderRow {
  const { order_items, ...rest } = data;
  return { ...(rest as OrderRow), items: Array.isArray(order_items) ? order_items.map((item: any) => ({ id: String(item.id), unit_price_minor: Number(item.unit_price_minor), quantity: Number(item.quantity), gift_message: String(item.gift_message ?? '') })) : [] };
}

function emailBase(order: OrderRow, orderUrlBase: string) {
  return {
    orderId: order.id,
    recipient: order.customer_email ?? '',
    locale: order.locale,
    orderNumber: order.display_number,
    totalMinor: order.total_minor,
    subtotalMinor: order.subtotal_minor,
    deliveryFeeMinor: order.delivery_fee_minor,
    discountMinor: order.discount_minor ?? undefined,
    orderUrl: `${orderUrlBase.replace(/\/$/, '')}/orders/${order.id}?token=${encodeURIComponent(order.public_token ?? '')}`,
  };
}

async function applyChangeToOrder(client: ChangeClient, order: OrderRow, diff: ChangeRequestDiff, actorId: string | null): Promise<boolean> {
  const computed = applyChanges(order, order.items, diff);
  if (!computed.ok) return false;
  if (!client.rpc) return false;
  const itemUpdates = (diff.items ?? []).map((change) => {
    const item = computed.items.find((row) => row.id === change.id);
    return {
      id: change.id,
      quantity: item?.quantity,
      gift_message: item?.gift_message,
    };
  });
  const result = await client.rpc('apply_change_to_order', {
    p_order_id: order.id,
    p_order_updates: computed.fields,
    p_subtotal_minor: computed.subtotalMinor,
    p_total_minor: computed.totalMinor,
    p_items: itemUpdates,
  });
  if (result && typeof result === 'object' && 'error' in result && result.error) return false;
  const { error: eventError } = await client.from('order_events').insert({ order_id: order.id, actor_id: actorId, event_type: 'change_applied', from_status: null, to_status: null, metadata: { delta_minor: computed.deltaMinor } });
  return !eventError;
}

export type SubmitChangeRequestResult =
  | { status: 'applied'; deltaMinor: number }
  | { status: 'created'; requestId: string }
  | { status: 'ineligible'; reason: Exclude<ChangeEligibility, 'ok'> }
  | { status: 'invalid'; error: string }
  | { status: 'not_found' }
  | { status: 'failure' };

export async function submitChangeRequest(
  client: ChangeClient,
  input: { customerId: string; orderId: string; changes: unknown; reason?: string },
  deps: { deliver?: typeof deliverOrderNotification; orderUrlBase?: string } = {},
): Promise<SubmitChangeRequestResult> {
  const deliver = deps.deliver ?? deliverOrderNotification;
  const parsed = parseChangeRequestDiff(input.changes);
  if (!parsed.ok) return { status: 'invalid', error: parsed.error };
  try {
    const { data } = await client.from('orders').select(fullSelect).eq('id', input.orderId).eq('customer_id', input.customerId).maybeSingle();
    if (!data) return { status: 'not_found' };
    const order = normalizeOrder(data);
    const [{ data: pendingChange }, { data: pendingCancel }] = await Promise.all([
      client.from('order_change_requests').select('id').eq('order_id', order.id).eq('status', 'pending').maybeSingle(),
      client.from('order_cancel_requests').select('id').eq('order_id', order.id).eq('status', 'pending').maybeSingle(),
    ]);
    const eligibility = canRequestChange({ fulfillmentStatus: order.fulfillment_status, paymentStatus: order.payment_status, hasPendingRequest: Boolean(pendingChange || pendingCancel) });
    if (eligibility !== 'ok') return { status: 'ineligible', reason: eligibility };
    const reason = input.reason?.trim() || null;

    if (!requiresReview({ fulfillmentStatus: order.fulfillment_status, paymentStatus: order.payment_status })) {
      const computed = applyChanges(order, order.items, parsed.diff);
      if (!computed.ok) return { status: 'invalid', error: computed.reason };
      const { data: inserted, error: insertError } = await client.from('order_change_requests').insert({ order_id: order.id, customer_id: input.customerId, changes: parsed.diff, status: 'applied', delta_minor: computed.deltaMinor, reason }).select('id').single();
      if (insertError || !inserted) return { status: 'failure' };
      const applied = await applyChangeToOrder(client, order, parsed.diff, input.customerId);
      if (!applied) return { status: 'failure' };
      if (order.customer_email) await deliver(client, { ...emailBase(order, deps.orderUrlBase ?? ''), type: 'change_approved' }, deps.deliver as never);
      return { status: 'applied', deltaMinor: computed.deltaMinor };
    }

    const { data: created, error: insertError } = await client.from('order_change_requests').insert({ order_id: order.id, customer_id: input.customerId, changes: parsed.diff, status: 'pending', reason }).select('id').single();
    if (insertError || !created) return { status: 'failure' };
    await client.from('order_events').insert({ order_id: order.id, actor_id: input.customerId, event_type: 'change_requested', from_status: null, to_status: null });
    return { status: 'created', requestId: String(created.id) };
  } catch {
    return { status: 'failure' };
  }
}

export type ReviewChangeResult =
  | { status: 'approved'; deltaMinor: number }
  | { status: 'applied'; deltaMinor: number }
  | { status: 'rejected' }
  | { status: 'not_found' }
  | { status: 'not_applicable' }
  | { status: 'refund_failed' }
  | { status: 'failure' };

export async function reviewChangeRequest(
  client: ChangeClient,
  input: { admin: AdminIdentity; requestId: string; action: 'approve' | 'reject'; reason?: string; orderUrlBase: string },
  deps: { deliver?: typeof deliverOrderNotification; refund?: typeof refundPaymobTransaction } = {},
): Promise<ReviewChangeResult> {
  const deliver = deps.deliver ?? deliverOrderNotification;
  const refund = deps.refund ?? refundPaymobTransaction;
  try {
    const { data } = await client.from('order_change_requests').select(`*,orders(${fullSelect})`).eq('id', input.requestId).maybeSingle();
    if (!data || !data.orders) return { status: 'not_found' };
    const request = data as { id: string; status: string; reason: string | null; changes: ChangeRequestDiff; orders: Record<string, any> };
    const order = normalizeOrder(request.orders);
    const now = new Date().toISOString();
    const base = emailBase(order, input.orderUrlBase);

    if (input.action === 'reject') {
      if (request.status !== 'pending' && request.status !== 'approved') return { status: 'not_applicable' };
      const { error } = await client.from('order_change_requests').update({ status: 'rejected', reason: input.reason?.trim() || null, reviewed_by: input.admin.userId, reviewed_at: now }).eq('id', input.requestId);
      if (error) return { status: 'failure' };
      await client.from('order_events').insert({ order_id: order.id, actor_id: input.admin.userId, event_type: 'change_rejected', from_status: null, to_status: null });
      await client.from('admin_audit_logs').insert({ actor_id: input.admin.userId, action: 'reject_change_request', target_type: 'order', target_id: order.id, metadata: { request_id: input.requestId } });
      if (order.customer_email) await deliver(client, { ...base, type: 'change_rejected' }, deps.deliver as never);
      return { status: 'rejected' };
    }

    if (request.status !== 'pending') return { status: 'not_applicable' };
    const parsed = parseChangeRequestDiff(request.changes);
    const computed = parsed.ok ? applyChanges(order, order.items, parsed.diff) : null;
    if (!parsed.ok || !computed || !computed.ok) return { status: 'not_applicable' };
    const delta = computed.deltaMinor;

    if (order.payment_status === 'paid' && delta > 0) {
      const { error } = await client.from('order_change_requests').update({ status: 'approved', delta_minor: delta, reason: input.reason?.trim() || null, reviewed_by: input.admin.userId, reviewed_at: now }).eq('id', input.requestId);
      if (error) return { status: 'failure' };
      await client.from('order_events').insert({ order_id: order.id, actor_id: input.admin.userId, event_type: 'change_approved', from_status: null, to_status: null, metadata: { delta_minor: delta, awaiting_payment: true } });
      await client.from('admin_audit_logs').insert({ actor_id: input.admin.userId, action: 'approve_change_request', target_type: 'order', target_id: order.id, metadata: { request_id: input.requestId, delta_minor: delta, awaiting_payment: true } });
      if (order.customer_email) await deliver(client, { ...base, type: 'change_payment_required' }, deps.deliver as never);
      return { status: 'approved', deltaMinor: delta };
    }

    if (order.payment_status === 'paid' && delta < 0) {
      const payment = (order.payments ?? []).find((row) => row.status === 'paid');
      if (!payment?.provider_reference) return { status: 'refund_failed' };
      const refundResult: PaymobRefundResult = await refund({ transactionId: payment.provider_reference, amountMinor: Math.abs(delta) });
      if (!refundResult.ok) return { status: 'refund_failed' };
      const { error: paymentError } = await client.from('payments').insert({ order_id: order.id, provider: 'paymob', provider_reference: refundResult.refundTransactionId, idempotency_key: `change-refund:${input.requestId}`, amount_minor: Math.abs(delta), currency: 'EGP', status: 'refunded', raw_event: { refund: { request_id: input.requestId, at: now } } });
      if (paymentError) return { status: 'failure' };
    }

    const applied = await applyChangeToOrder(client, order, parsed.diff, input.admin.userId);
    if (!applied) return { status: 'failure' };
    const { error: requestError } = await client.from('order_change_requests').update({ status: 'applied', delta_minor: delta, reason: input.reason?.trim() || null, reviewed_by: input.admin.userId, reviewed_at: now }).eq('id', input.requestId);
    if (requestError) return { status: 'failure' };
    await client.from('admin_audit_logs').insert({ actor_id: input.admin.userId, action: 'approve_change_request', target_type: 'order', target_id: order.id, metadata: { request_id: input.requestId, delta_minor: delta } });
    if (order.customer_email) await deliver(client, { ...base, type: 'change_approved' }, deps.deliver as never);
    return { status: 'applied', deltaMinor: delta };
  } catch {
    return { status: 'failure' };
  }
}

export async function handleChangePaymentCallback(
  client: ChangeClient,
  transaction: Record<string, any>,
  deps: { deliver?: typeof deliverOrderNotification; orderUrlBase?: string } = {},
): Promise<{ handled: boolean }> {
  const deliver = deps.deliver ?? deliverOrderNotification;
  const special = String(transaction.order?.special_reference ?? transaction.special_reference ?? '');
  if (!special.startsWith('change:')) return { handled: false };
  const requestId = special.slice('change:'.length);
  if (!requestId || transaction.success !== true) return { handled: true };
  try {
    const { data } = await client.from('order_change_requests').select(`*,orders(${fullSelect})`).eq('id', requestId).maybeSingle();
    if (!data || !data.orders) return { handled: true };
    const request = data as { id: string; status: string; changes: ChangeRequestDiff; orders: Record<string, any> };
    if (request.status !== 'approved') return { handled: true };
    const order = normalizeOrder(request.orders);
    const parsed = parseChangeRequestDiff(request.changes);
    const computed = parsed.ok ? applyChanges(order, order.items, parsed.diff) : null;
    if (!parsed.ok || !computed || !computed.ok) return { handled: true };
    const amountMinor = Number(transaction.amount_cents ?? 0);
    if (amountMinor !== computed.deltaMinor) return { handled: true };
    const providerReference = String(transaction.id ?? transaction.order?.id ?? '');
    const idempotencyKey = `change-pay:${providerReference}:success`;
    const { data: inserted, error: insertError } = await client.from('payments').insert({ order_id: order.id, provider: 'paymob', provider_reference: providerReference, idempotency_key: idempotencyKey, amount_minor: amountMinor, currency: String(transaction.currency ?? 'EGP'), status: 'paid', raw_event: transaction }).select('id').maybeSingle();
    if (insertError && !insertError.message.toLowerCase().includes('duplicate')) throw insertError;
    if (!inserted && insertError) return { handled: true };
    const applied = await applyChangeToOrder(client, order, parsed.diff, null);
    if (!applied) throw new Error('change apply failed after delta payment');
    const { error: requestError } = await client.from('order_change_requests').update({ status: 'applied', reviewed_at: new Date().toISOString() }).eq('id', request.id);
    if (requestError) throw requestError;
    if (order.customer_email) await deliver(client, { ...emailBase(order, deps.orderUrlBase ?? ''), type: 'change_approved' }, deps.deliver as never);
    return { handled: true };
  } catch {
    return { handled: true };
  }
}

type CreateDeltaIntention = (input: Omit<CreatePaymentInput, 'integrationId'>) => Promise<{ providerReference: string; checkoutUrl: string }>;

const defaultCreateIntention: CreateDeltaIntention = (input) => createPaymobIntention({ ...input, integrationId: Number(getRequiredServerEnv('PAYMOB_INTEGRATION_ID')) });

export type PayDeltaResult = { status: 'ok'; checkoutUrl: string } | { status: 'not_found' } | { status: 'not_payable' } | { status: 'failure' };

export async function payChangeRequestDelta(
  client: ChangeClient,
  input: { customerId: string; requestId: string },
  deps: { origin: string; createIntention?: CreateDeltaIntention },
): Promise<PayDeltaResult> {
  const create = deps.createIntention ?? defaultCreateIntention;
  try {
    const { data } = await client.from('order_change_requests').select(`id,status,delta_minor,orders(${orderSelect})`).eq('id', input.requestId).maybeSingle();
    if (!data || !data.orders) return { status: 'not_found' };
    const request = data as { id: string; status: string; delta_minor: number | null; orders: Record<string, any> };
    const order = normalizeOrder(request.orders);
    if (order.customer_id !== input.customerId) return { status: 'not_found' };
    if (request.status !== 'approved' || !request.delta_minor || request.delta_minor <= 0) return { status: 'not_payable' };
    const origin = deps.origin.replace(/\/$/, '');
    const result = await create({
      amountMinor: request.delta_minor,
      orderReference: `change:${request.id}`,
      customer: { name: order.recipient_name, email: order.customer_email ?? '', phone: order.recipient_phone },
      notificationUrl: `${origin}/api/webhooks/paymob`,
      redirectionUrl: `${origin}/orders/${order.id}?token=${encodeURIComponent(order.public_token ?? '')}`,
    });
    return { status: 'ok', checkoutUrl: result.checkoutUrl };
  } catch {
    return { status: 'failure' };
  }
}
