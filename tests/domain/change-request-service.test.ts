import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleChangePaymentCallback, payChangeRequestDelta, reviewChangeRequest, submitChangeRequest } from '@/features/order-mutations/change-request-service';

const orderRow = {
  id: 'o1', display_number: 'RO-1', fulfillment_status: 'confirmed', payment_status: 'pending',
  customer_id: 'c1', customer_email: 'buyer@example.com', locale: 'en',
  total_minor: 11500, subtotal_minor: 10000, delivery_fee_minor: 1500, discount_minor: null, public_token: 'tok',
  recipient_name: 'Sam', recipient_phone: '+20 1', delivery_address: 'Street 1', delivery_date: '2026-08-19', delivery_window: '17:00-19:00',
  order_items: [
    { id: 'i1', unit_price_minor: 6000, quantity: 1, gift_message: '' },
    { id: 'i2', unit_price_minor: 4000, quantity: 1, gift_message: 'hi' },
  ],
};

const deliver = vi.fn().mockResolvedValue({ accepted: true });
const refund = vi.fn().mockResolvedValue({ ok: true, refundTransactionId: 'refund-1' });
const createIntention = vi.fn().mockResolvedValue({ providerReference: 'int-1', checkoutUrl: 'https://pay.example/checkout' });

beforeEach(() => { deliver.mockClear(); refund.mockClear(); createIntention.mockClear(); });

// ---- submitChangeRequest ----

function submitClient(options: { order?: unknown; pendingChange?: unknown; pendingCancel?: unknown } = {}) {
  const calls: Array<{ table: string; op: string; payload?: unknown }> = [];
  const requestId = 'req-1';
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const client = {
    from: (table: string) => ({
      select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => {
        if (table === 'orders') return { data: options.order ?? null, error: null };
        if (table === 'order_change_requests') return { data: options.pendingChange ?? null, error: null };
        return { data: options.pendingCancel ?? null, error: null };
      } }) }) }),
      insert: (payload: unknown) => { calls.push({ table, op: 'insert', payload }); return { select: () => ({ single: async () => ({ data: { id: requestId }, error: null }) }) }; },
      update: (payload: unknown) => { calls.push({ table, op: 'update', payload }); return { eq: () => ({ error: null }) }; },
    }),
    rpc: async (name: string, args: Record<string, unknown>) => { rpcCalls.push({ name, args }); return { data: true, error: null }; },
  };
  return { client, calls, rpcCalls };
}

describe('submitChangeRequest', () => {
  it('returns not_found when the order does not belong to the customer', async () => {
    const { client } = submitClient({ order: null });
    expect(await submitChangeRequest(client, { customerId: 'c1', orderId: 'o1', changes: { delivery_date: '2026-08-20' } }, { deliver })).toEqual({ status: 'not_found' });
  });

  it('returns invalid for a malformed diff', async () => {
    const { client } = submitClient({ order: orderRow });
    expect(await submitChangeRequest(client, { customerId: 'c1', orderId: 'o1', changes: {} }, { deliver })).toEqual({ status: 'invalid', error: 'empty_diff' });
  });

  it('blocks when a pending cancellation exists for the order', async () => {
    const { client } = submitClient({ order: orderRow, pendingCancel: { id: 'cr-1' } });
    expect(await submitChangeRequest(client, { customerId: 'c1', orderId: 'o1', changes: { delivery_date: '2026-08-20' } }, { deliver })).toEqual({ status: 'ineligible', reason: 'request_pending' });
  });

  it('auto-applies a confirmed unpaid order and emails change_approved', async () => {
    const { client, calls, rpcCalls } = submitClient({ order: orderRow, pendingChange: null, pendingCancel: null });
    const result = await submitChangeRequest(client, { customerId: 'c1', orderId: 'o1', changes: { items: [{ id: 'i1', quantity: 2 }] }, reason: 'more stems' }, { deliver, orderUrlBase: 'https://example.com' });
    expect(result).toEqual({ status: 'applied', deltaMinor: 6000 });
    expect(calls).toContainEqual(expect.objectContaining({ table: 'order_change_requests', op: 'insert', payload: expect.objectContaining({ status: 'applied', delta_minor: 6000, changes: { items: [{ id: 'i1', quantity: 2 }] } }) }));
    expect(rpcCalls).toContainEqual(expect.objectContaining({ name: 'apply_change_to_order', args: expect.objectContaining({ p_subtotal_minor: 16000, p_total_minor: 17500, p_items: expect.arrayContaining([expect.objectContaining({ id: 'i1', quantity: 2 })]) }) }));
    expect(calls.filter((call) => call.table === 'orders' && call.op === 'update')).toEqual([]);
    expect(calls.filter((call) => call.table === 'order_items' && call.op === 'update')).toEqual([]);
    expect(deliver).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ type: 'change_approved' }), expect.anything());
  });

  it('queues a pending request for a paid order without applying', async () => {
    const { client, calls } = submitClient({ order: { ...orderRow, payment_status: 'paid' }, pendingChange: null, pendingCancel: null });
    const result = await submitChangeRequest(client, { customerId: 'c1', orderId: 'o1', changes: { delivery_date: '2026-08-20' } }, { deliver });
    expect(result).toEqual({ status: 'created', requestId: 'req-1' });
    expect(calls).toContainEqual(expect.objectContaining({ table: 'order_change_requests', op: 'insert', payload: expect.objectContaining({ status: 'pending' }) }));
    expect(calls.filter((call) => call.table === 'orders' && call.op === 'update')).toEqual([]);
    expect(deliver).not.toHaveBeenCalled();
  });
});

// ---- reviewChangeRequest ----

const admin = { userId: 'a1', role: 'admin' as const };
const paidPayment = { id: 'pay-1', provider_reference: 'txn-1', amount_minor: 11500, status: 'paid' };

function requestWithOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'req-1', status: 'pending', reason: null, changes: { items: [{ id: 'i1', quantity: 2 }] }, delta_minor: null,
    orders: { ...orderRow, fulfillment_status: 'preparing', payment_status: 'paid', payments: [paidPayment], order_items: orderRow.order_items },
    ...overrides,
  };
}

// i2 starts at quantity 2 (subtotal 14000, total 15500), so dropping it to 1
// yields subtotal 10000, total 11500, delta = -4000.
function downRequest(overrides: Record<string, unknown> = {}) {
  return requestWithOrder({
    changes: { items: [{ id: 'i2', quantity: 1, gift_message: '' }] },
    orders: { ...requestWithOrder().orders, subtotal_minor: 14000, total_minor: 15500, order_items: [{ id: 'i1', unit_price_minor: 6000, quantity: 1, gift_message: '' }, { id: 'i2', unit_price_minor: 4000, quantity: 2, gift_message: 'hi' }] },
    ...overrides,
  });
}

function reviewClient(request: unknown) {
  const calls: Array<{ table: string; op: string; payload?: unknown }> = [];
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const client = {
    from: (table: string) => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: request, error: null }) }) }),
      update: (payload: unknown) => { calls.push({ table, op: 'update', payload }); return { eq: () => ({ error: null }) }; },
      // Supports both the bare insert (order_events/admin_audit_logs) and the
      // payments insert chain `.select('id').maybeSingle()`.
      insert: (payload: unknown) => { calls.push({ table, op: 'insert', payload }); return { select: () => ({ maybeSingle: async () => ({ data: { id: 'p1' }, error: null }) }) }; },
    }),
    rpc: async (name: string, args: Record<string, unknown>) => { rpcCalls.push({ name, args }); return { data: true, error: null }; },
  };
  return { client, calls, rpcCalls };
}

const reviewInput = { admin, requestId: 'req-1', action: 'approve' as const, orderUrlBase: 'https://example.com' };

describe('reviewChangeRequest', () => {
  it('returns not_found when the request is missing', async () => {
    const { client } = reviewClient(null);
    expect(await reviewChangeRequest(client, reviewInput, { deliver, refund })).toEqual({ status: 'not_found' });
  });

  it('returns not_applicable when the request was already applied', async () => {
    const { client } = reviewClient(requestWithOrder({ status: 'applied' }));
    expect(await reviewChangeRequest(client, reviewInput, { deliver, refund })).toEqual({ status: 'not_applicable' });
  });

  it('approves a paid delta>0 request as awaiting payment, without touching the order', async () => {
    const { client, calls } = reviewClient(requestWithOrder());
    const result = await reviewChangeRequest(client, reviewInput, { deliver, refund });
    expect(result).toEqual({ status: 'approved', deltaMinor: 6000 });
    expect(calls).toContainEqual(expect.objectContaining({ table: 'order_change_requests', op: 'update', payload: expect.objectContaining({ status: 'approved', delta_minor: 6000, reviewed_by: 'a1' }) }));
    expect(calls.filter((call) => call.table === 'orders' && call.op === 'update')).toEqual([]);
    expect(refund).not.toHaveBeenCalled();
    expect(deliver).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ type: 'change_payment_required' }), expect.anything());
  });

  it('refunds the delta and applies for a paid delta<0 request', async () => {
    const { client, calls, rpcCalls } = reviewClient(downRequest());
    const result = await reviewChangeRequest(client, reviewInput, { deliver, refund });
    expect(result).toEqual({ status: 'applied', deltaMinor: -4000 });
    expect(refund).toHaveBeenCalledWith({ transactionId: 'txn-1', amountMinor: 4000 });
    expect(calls).toContainEqual(expect.objectContaining({ table: 'payments', op: 'insert', payload: expect.objectContaining({ status: 'refunded', amount_minor: 4000, idempotency_key: 'change-refund:req-1' }) }));
    expect(rpcCalls).toContainEqual(expect.objectContaining({ name: 'apply_change_to_order', args: expect.objectContaining({ p_subtotal_minor: 10000, p_total_minor: 11500 }) }));
    expect(calls.filter((call) => call.table === 'orders' && call.op === 'update')).toEqual([]);
    expect(calls).toContainEqual(expect.objectContaining({ table: 'order_change_requests', op: 'update', payload: expect.objectContaining({ status: 'applied', delta_minor: -4000 }) }));
    expect(deliver).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ type: 'change_approved' }), expect.anything());
  });

  it('blocks approval when the refund fails, leaving the request pending', async () => {
    refund.mockResolvedValueOnce({ ok: false, error: 'Paymob refund failed with status 400' });
    const { client, calls } = reviewClient(downRequest());
    const result = await reviewChangeRequest(client, reviewInput, { deliver, refund });
    expect(result).toEqual({ status: 'refund_failed' });
    expect(calls.filter((call) => call.table === 'orders' && call.op === 'update')).toEqual([]);
    expect(calls.filter((call) => call.table === 'order_change_requests' && call.op === 'update')).toEqual([]);
    expect(deliver).not.toHaveBeenCalled();
  });

  it('blocks approval when the order is paid but has no refundable payment row', async () => {
    const { client } = reviewClient(downRequest({ orders: { ...downRequest().orders, payments: [] } }));
    const result = await reviewChangeRequest(client, reviewInput, { deliver, refund });
    expect(result).toEqual({ status: 'refund_failed' });
    expect(refund).not.toHaveBeenCalled();
  });

  it('applies an unpaid order immediately with no money calls', async () => {
    const unpaid = requestWithOrder({ orders: { ...requestWithOrder().orders, payment_status: 'pending', fulfillment_status: 'confirmed' } });
    const { client } = reviewClient(unpaid);
    const result = await reviewChangeRequest(client, reviewInput, { deliver, refund });
    expect(result).toEqual({ status: 'applied', deltaMinor: 6000 });
    expect(refund).not.toHaveBeenCalled();
  });

  it('rejects the request and emails change_rejected', async () => {
    const { client, calls } = reviewClient(requestWithOrder());
    const result = await reviewChangeRequest(client, { ...reviewInput, action: 'reject', reason: 'too late' }, { deliver });
    expect(result).toEqual({ status: 'rejected' });
    expect(calls).toContainEqual(expect.objectContaining({ table: 'order_change_requests', op: 'update', payload: expect.objectContaining({ status: 'rejected', reason: 'too late', reviewed_by: 'a1' }) }));
    expect(deliver).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ type: 'change_rejected' }), expect.anything());
  });

  it('allows rejecting an approved (awaiting payment) request', async () => {
    const { client } = reviewClient(requestWithOrder({ status: 'approved' }));
    expect(await reviewChangeRequest(client, { ...reviewInput, action: 'reject' }, { deliver })).toEqual({ status: 'rejected' });
  });
});

// ---- handleChangePaymentCallback ----

const successTransaction = { id: 'pay-txn-1', success: true, amount_cents: 6000, currency: 'EGP', order: { special_reference: 'change:req-1' } };

describe('handleChangePaymentCallback', () => {
  it('returns handled:false for a non-change reference', async () => {
    const { client } = reviewClient(null);
    expect(await handleChangePaymentCallback(client, { order: { special_reference: 'RO-1' } }, { deliver })).toEqual({ handled: false });
  });

  it('ignores callbacks for unknown request ids', async () => {
    const { client } = reviewClient(null);
    expect(await handleChangePaymentCallback(client, successTransaction, { deliver })).toEqual({ handled: true });
    expect(deliver).not.toHaveBeenCalled();
  });

  it('ignores callbacks when the request is not awaiting payment', async () => {
    const { client, calls } = reviewClient(requestWithOrder({ status: 'applied' }));
    expect(await handleChangePaymentCallback(client, successTransaction, { deliver })).toEqual({ handled: true });
    expect(calls.filter((call) => call.table === 'payments' && call.op === 'insert')).toEqual([]);
  });

  it('records the delta payment, applies the change, and emails change_approved', async () => {
    const { client, calls, rpcCalls } = reviewClient(requestWithOrder({ status: 'approved' }));
    const result = await handleChangePaymentCallback(client, successTransaction, { deliver, orderUrlBase: 'https://example.com' });
    expect(result).toEqual({ handled: true });
    expect(calls).toContainEqual(expect.objectContaining({ table: 'payments', op: 'insert', payload: expect.objectContaining({ status: 'paid', amount_minor: 6000, idempotency_key: 'change-pay:pay-txn-1:success' }) }));
    expect(rpcCalls).toContainEqual(expect.objectContaining({ name: 'apply_change_to_order', args: expect.objectContaining({ p_total_minor: 17500 }) }));
    expect(calls.filter((call) => call.table === 'orders' && call.op === 'update')).toEqual([]);
    expect(calls).toContainEqual(expect.objectContaining({ table: 'order_change_requests', op: 'update', payload: expect.objectContaining({ status: 'applied' }) }));
    expect(deliver).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ type: 'change_approved' }), expect.anything());
  });

  it('does not apply when the amount does not match the stored delta', async () => {
    const { client, calls } = reviewClient(requestWithOrder({ status: 'approved' }));
    await handleChangePaymentCallback(client, { ...successTransaction, amount_cents: 100 }, { deliver });
    expect(calls.filter((call) => call.table === 'payments' && call.op === 'insert')).toEqual([]);
    expect(calls.filter((call) => call.table === 'orders' && call.op === 'update')).toEqual([]);
  });

  it('does not apply when the payment failed', async () => {
    const { client, calls } = reviewClient(requestWithOrder({ status: 'approved' }));
    await handleChangePaymentCallback(client, { ...successTransaction, success: false }, { deliver });
    expect(calls.filter((call) => call.table === 'orders' && call.op === 'update')).toEqual([]);
  });
});

// ---- payChangeRequestDelta ----

function payClient(request: unknown) {
  const client = {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: request, error: null }) }) }) }),
  };
  return { client };
}

describe('payChangeRequestDelta', () => {
  it('returns not_found for another customer\u2019s request', async () => {
    const { client } = payClient({ id: 'req-1', status: 'approved', delta_minor: 6000, orders: { ...orderRow, customer_id: 'other' } });
    expect(await payChangeRequestDelta(client, { customerId: 'c1', requestId: 'req-1' }, { origin: 'https://example.com', createIntention })).toEqual({ status: 'not_found' });
  });

  it('returns not_payable when the request is not approved', async () => {
    const { client } = payClient({ id: 'req-1', status: 'pending', delta_minor: null, orders: orderRow });
    expect(await payChangeRequestDelta(client, { customerId: 'c1', requestId: 'req-1' }, { origin: 'https://example.com', createIntention })).toEqual({ status: 'not_payable' });
  });

  it('creates an intention for the delta and returns the checkout URL', async () => {
    const { client } = payClient({ id: 'req-1', status: 'approved', delta_minor: 6000, orders: { ...orderRow, customer_id: 'c1' } });
    const result = await payChangeRequestDelta(client, { customerId: 'c1', requestId: 'req-1' }, { origin: 'https://example.com', createIntention });
    expect(result).toEqual({ status: 'ok', checkoutUrl: 'https://pay.example/checkout' });
    expect(createIntention).toHaveBeenCalledWith(expect.objectContaining({ amountMinor: 6000, orderReference: 'change:req-1' }));
  });

  it('returns failure when the intention call throws', async () => {
    createIntention.mockRejectedValueOnce(new Error('boom'));
    const { client } = payClient({ id: 'req-1', status: 'approved', delta_minor: 6000, orders: { ...orderRow, customer_id: 'c1' } });
    expect(await payChangeRequestDelta(client, { customerId: 'c1', requestId: 'req-1' }, { origin: 'https://example.com', createIntention })).toEqual({ status: 'failure' });
  });
});
