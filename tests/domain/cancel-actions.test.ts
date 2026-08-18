import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requestCancellation } from '@/features/orders/cancel-actions';

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
