import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requestCancellation, reviewCancellationRequest } from '@/features/orders/cancel-actions';

type Call = { table: string; op: string; payload?: unknown; eq?: Array<[string, unknown]> };

const orderRow = {
  id: 'o1', display_number: 'RO-1', fulfillment_status: 'confirmed', payment_status: 'pending',
  customer_id: 'c1', customer_email: 'buyer@example.com', locale: 'en',
  total_minor: 10000, subtotal_minor: 10000, delivery_fee_minor: 0, discount_minor: null, public_token: 'tok',
};

function fakeClient(options: { order?: unknown; pendingRequest?: unknown } = {}) {
  const calls: Call[] = [];
  const record = (table: string, op: string, payload?: unknown) => calls.push({ table, op, payload });
  // Both lookups in the service are two-eq chains ending in maybeSingle:
  //   orders:                select(...).eq('id').eq('customer_id').maybeSingle()
  //   order_cancel_requests: select('id').eq('order_id').eq('status').maybeSingle()
  const client = {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: table === 'orders' ? (options.order ?? null) : (options.pendingRequest ?? null), error: null }),
          }),
        }),
      }),
      insert: (payload: unknown) => { record(table, 'insert', payload); return { select: () => ({ single: async () => ({ data: { id: 'req-1' }, error: null }) }) }; },
      update: (payload: unknown) => ({ eq: (_col: string, id: string) => { record(table, 'update', payload); return { error: null }; } }),
    }),
  };
  return { client, calls };
}

const deliver = vi.fn().mockResolvedValue({ accepted: true });

beforeEach(() => deliver.mockClear());

describe('requestCancellation', () => {
  it('returns not_found when the order does not belong to the customer', async () => {
    const { client } = fakeClient({ order: null });
    const result = await requestCancellation(client, { customerId: 'c1', orderId: 'o1' }, { deliver });
    expect(result).toEqual({ status: 'not_found' });
  });

  it('returns ineligible with the reason for a cancelled order', async () => {
    const { client } = fakeClient({ order: { ...orderRow, fulfillment_status: 'cancelled' } });
    const result = await requestCancellation(client, { customerId: 'c1', orderId: 'o1' }, { deliver });
    expect(result).toEqual({ status: 'ineligible', reason: 'already_cancelled' });
  });

  it('auto-cancels a confirmed, unpaid order and sends the approved email', async () => {
    const { client, calls } = fakeClient({ order: orderRow, pendingRequest: null });
    const result = await requestCancellation(client, { customerId: 'c1', orderId: 'o1', reason: 'changed my mind' }, { deliver, orderUrlBase: 'https://example.com' });
    expect(result).toEqual({ status: 'auto_cancelled' });
    expect(calls).toContainEqual(expect.objectContaining({ table: 'orders', op: 'update', payload: expect.objectContaining({ fulfillment_status: 'cancelled', payment_status: 'cancelled' }) }));
    expect(calls).toContainEqual(expect.objectContaining({ table: 'order_events', op: 'insert' }));
    expect(deliver).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ type: 'cancel_approved', recipient: 'buyer@example.com' }), expect.anything());
  });

  it('queues a request for admin review when payment is captured', async () => {
    const { client, calls } = fakeClient({ order: { ...orderRow, payment_status: 'paid' }, pendingRequest: null });
    const result = await requestCancellation(client, { customerId: 'c1', orderId: 'o1', reason: 'please cancel' }, { deliver });
    expect(result).toEqual({ status: 'created', requestId: 'req-1' });
    const insert = calls.find((call) => call.table === 'order_cancel_requests');
    expect(insert?.payload).toEqual(expect.objectContaining({ order_id: 'o1', customer_id: 'c1', status: 'pending', reason: 'please cancel' }));
    expect(deliver).not.toHaveBeenCalled();
  });

  it('queues a request when fulfillment has started even if unpaid', async () => {
    const { client } = fakeClient({ order: { ...orderRow, fulfillment_status: 'preparing' }, pendingRequest: null });
    const result = await requestCancellation(client, { customerId: 'c1', orderId: 'o1' }, { deliver });
    expect(result).toEqual({ status: 'created', requestId: 'req-1' });
  });

  it('returns ineligible when a pending request already exists', async () => {
    const { client } = fakeClient({ order: orderRow, pendingRequest: { id: 'req-0', status: 'pending' } });
    const result = await requestCancellation(client, { customerId: 'c1', orderId: 'o1' }, { deliver });
    expect(result).toEqual({ status: 'ineligible', reason: 'request_pending' });
  });
});

const admin = { userId: 'a1', role: 'admin' as const };

const paidPayment = { id: 'pay-1', provider_reference: 'txn-1', amount_minor: 10000, status: 'paid' };

const requestWithOrder = (overrides: Record<string, unknown> = {}) => ({
  id: 'req-1', status: 'pending', reason: 'changed my mind', customer_id: 'c1', reviewed_by: null, reviewed_at: null,
  orders: { id: 'o1', display_number: 'RO-1', fulfillment_status: 'preparing', payment_status: 'paid', customer_email: 'buyer@example.com', locale: 'en', total_minor: 10000, subtotal_minor: 10000, delivery_fee_minor: 0, discount_minor: null, public_token: 'tok', payments: [paidPayment] },
  ...overrides,
});

function reviewClient(request: unknown) {
  const calls: Array<{ table: string; op: string; payload?: unknown }> = [];
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  // The service looks up the request with select(...).eq('id', requestId).maybeSingle().
  const client = {
    from: (table: string) => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: request, error: null }) }) }),
      update: (payload: unknown) => ({ eq: (_col: string, id: string) => { calls.push({ table, op: 'update', payload }); return { error: null }; } }),
      insert: (payload: unknown) => { calls.push({ table, op: 'insert', payload }); return { error: null }; },
    }),
    rpc: async (name: string, args: Record<string, unknown>) => { rpcCalls.push({ name, args }); return { data: true, error: null }; },
  };
  return { client, calls, rpcCalls };
}

const refund = vi.fn().mockResolvedValue({ ok: true, refundTransactionId: 'refund-1' });

beforeEach(() => refund.mockClear());

describe('reviewCancellationRequest', () => {
  it('returns not_found when the request is missing', async () => {
    const { client } = reviewClient(null);
    expect(await reviewCancellationRequest(client, { admin, requestId: 'req-x', action: 'approve', orderUrlBase: 'https://example.com' }, { deliver, refund })).toEqual({ status: 'not_found' });
  });

  it('approves and cancels a paid order, refunding through Paymob first', async () => {
    const { client, calls } = reviewClient(requestWithOrder());
    const result = await reviewCancellationRequest(client, { admin, requestId: 'req-1', action: 'approve', reason: 'ok', orderUrlBase: 'https://example.com' }, { deliver, refund });
    expect(result).toEqual({ status: 'approved' });
    expect(refund).toHaveBeenCalledWith({ transactionId: 'txn-1', amountMinor: 10000 });
    expect(calls).toContainEqual(expect.objectContaining({ table: 'payments', op: 'update', payload: expect.objectContaining({ status: 'refunded' }) }));
    expect(calls).toContainEqual(expect.objectContaining({ table: 'orders', op: 'update', payload: expect.objectContaining({ fulfillment_status: 'cancelled', payment_status: 'refunded' }) }));
    expect(calls).toContainEqual(expect.objectContaining({ table: 'order_cancel_requests', op: 'update', payload: expect.objectContaining({ status: 'approved', reviewed_by: 'a1' }) }));
    expect(calls).toContainEqual(expect.objectContaining({ table: 'admin_audit_logs', op: 'insert' }));
    expect(deliver).toHaveBeenCalled();
  });

  it('restores the gift-card portion and refunds only the Paymob remainder', async () => {
    const { client, rpcCalls } = reviewClient(requestWithOrder({ orders: { ...requestWithOrder().orders, total_minor: 25000, gift_card_id: 'card-1', gift_card_minor: 75000, payments: [{ ...paidPayment, amount_minor: 25000 }] } }));
    const result = await reviewCancellationRequest(client, { admin, requestId: 'req-1', action: 'approve', orderUrlBase: 'https://example.com' }, { deliver, refund });
    expect(result).toEqual({ status: 'approved' });
    expect(rpcCalls).toEqual([{ name: 'refund_gift_card_redemption', args: { p_gift_card_id: 'card-1', p_order_id: 'o1', p_amount_minor: 75000, p_idempotency_key: 'gift-card-refund:o1' } }]);
    expect(refund).toHaveBeenCalledWith({ transactionId: 'txn-1', amountMinor: 25000 });
  });

  it('blocks approval when the Paymob refund fails, leaving the order paid and the request pending', async () => {
    const { client, calls } = reviewClient(requestWithOrder());
    refund.mockResolvedValueOnce({ ok: false, error: 'Paymob refund failed with status 400' });
    const result = await reviewCancellationRequest(client, { admin, requestId: 'req-1', action: 'approve', orderUrlBase: 'https://example.com' }, { deliver, refund });
    expect(result).toEqual({ status: 'refund_failed' });
    expect(calls.filter((call) => call.table === 'orders')).toEqual([]);
    expect(calls.filter((call) => call.table === 'order_cancel_requests')).toEqual([]);
    expect(deliver).not.toHaveBeenCalled();
  });

  it('blocks approval when the order is paid but has no refundable payment row', async () => {
    const { client } = reviewClient(requestWithOrder({ orders: { ...requestWithOrder().orders, payments: [] } }));
    const result = await reviewCancellationRequest(client, { admin, requestId: 'req-1', action: 'approve', orderUrlBase: 'https://example.com' }, { deliver, refund });
    expect(result).toEqual({ status: 'refund_failed' });
    expect(refund).not.toHaveBeenCalled();
  });

  it('cancels an unpaid order with payment_status cancelled and no refund call', async () => {
    const { client, calls } = reviewClient(requestWithOrder({ orders: { ...requestWithOrder().orders, payment_status: 'payment_failed' } }));
    await reviewCancellationRequest(client, { admin, requestId: 'req-1', action: 'approve', orderUrlBase: 'https://example.com' }, { deliver, refund });
    expect(refund).not.toHaveBeenCalled();
    expect(calls).toContainEqual(expect.objectContaining({ table: 'orders', op: 'update', payload: expect.objectContaining({ payment_status: 'cancelled' }) }));
  });

  it('returns not_cancellable when the order was already delivered', async () => {
    const { client } = reviewClient(requestWithOrder({ orders: { ...requestWithOrder().orders, fulfillment_status: 'delivered' } }));
    expect(await reviewCancellationRequest(client, { admin, requestId: 'req-1', action: 'approve', orderUrlBase: 'https://example.com' }, { deliver })).toEqual({ status: 'not_cancellable' });
  });

  it('rejects the request and sends the rejected email', async () => {
    const { client, calls } = reviewClient(requestWithOrder());
    const result = await reviewCancellationRequest(client, { admin, requestId: 'req-1', action: 'reject', reason: 'too late', orderUrlBase: 'https://example.com' }, { deliver });
    expect(result).toEqual({ status: 'rejected' });
    expect(calls).toContainEqual(expect.objectContaining({ table: 'order_cancel_requests', op: 'update', payload: expect.objectContaining({ status: 'rejected', reason: 'too late', reviewed_by: 'a1' }) }));
    expect(calls).toContainEqual(expect.objectContaining({ table: 'order_events', op: 'insert', payload: expect.objectContaining({ event_type: 'cancel_rejected' }) }));
    expect(deliver).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ type: 'cancel_rejected' }), expect.anything());
  });

  it('returns not_cancellable for an already-reviewed request', async () => {
    const { client } = reviewClient(requestWithOrder({ status: 'approved' }));
    expect(await reviewCancellationRequest(client, { admin, requestId: 'req-1', action: 'approve', orderUrlBase: 'https://example.com' }, { deliver })).toEqual({ status: 'not_cancellable' });
  });
});
