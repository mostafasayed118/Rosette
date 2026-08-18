import { describe, expect, it } from 'vitest';
import { listCustomerOrders, getCustomerOrder, getCancelRequestForOrder } from '@/features/account/account-repository';

function fakeListClient(rows: unknown[]) {
  return {
    from: () => ({
      select: () => ({ eq: () => ({ order: async () => ({ data: rows, error: null }) }) }),
    }),
  } as never;
}

function fakeDetailClient(row: unknown | null) {
  return {
    from: () => ({
      select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) }) }),
    }),
  } as never;
}

describe('listCustomerOrders', () => {
  it('maps order rows to summaries', async () => {
    const orders = await listCustomerOrders(fakeListClient([
      { id: 'o1', display_number: 'RO-1', created_at: '2026-08-18T00:00:00Z', total_minor: 12000, payment_status: 'paid', fulfillment_status: 'confirmed' },
    ]), 'u1');
    expect(orders).toEqual([{ id: 'o1', displayNumber: 'RO-1', createdAt: '2026-08-18T00:00:00Z', totalMinor: 12000, paymentStatus: 'paid', fulfillmentStatus: 'confirmed' }]);
  });

  it('returns an empty list when there are no rows', async () => {
    expect(await listCustomerOrders(fakeListClient([]), 'u1')).toEqual([]);
  });
});

describe('getCustomerOrder', () => {
  it('returns the mapped detail when the order belongs to the customer', async () => {
    const detail = await getCustomerOrder(fakeDetailClient({
      id: 'o1', display_number: 'RO-1', created_at: '2026-08-18T00:00:00Z', recipient_name: 'Maya',
      delivery_address: '12 Garden St', delivery_date: '2026-08-20', delivery_window: '12-3',
      subtotal_minor: 10500, delivery_fee_minor: 1500, total_minor: 12000, payment_status: 'paid',
      fulfillment_status: 'confirmed', order_items: [], order_events: [],
    }), 'u1', 'o1');
    expect(detail?.displayNumber).toBe('RO-1');
    expect(detail?.items).toEqual([]);
    expect(detail?.events).toEqual([]);
  });

  it('returns null when the order is not found', async () => {
    expect(await getCustomerOrder(fakeDetailClient(null), 'u1', 'o1')).toBeNull();
  });
});

describe('getCancelRequestForOrder', () => {
  function fakeCancelClient(row: unknown | null) {
    return {
      from: () => ({
        select: () => ({ eq: () => ({ eq: () => ({ order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) }) }) }) }),
      }),
    } as never;
  }

  it('returns the latest cancel request for an order', async () => {
    const request = await getCancelRequestForOrder(fakeCancelClient({ status: 'pending', reason: 'changed my mind', created_at: '2026-08-18T10:00:00.000Z' }), 'c1', 'o1');
    expect(request).toEqual({ status: 'pending', reason: 'changed my mind', createdAt: '2026-08-18T10:00:00.000Z' });
  });

  it('returns null when there is no cancel request', async () => {
    expect(await getCancelRequestForOrder(fakeCancelClient(null), 'c1', 'o1')).toBeNull();
  });
});
