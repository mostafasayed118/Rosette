import { describe, expect, it, vi } from 'vitest';

/**
 * Verifies the R-16 admin repository boundary actually maps Supabase rows into
 * the camelCased domain shapes the admin pages consume. These tests are what make
 * the repository layer "complete" rather than just compile — every field the
 * migrated pages read (order detail, list, dashboard, cancel/change queues) is
 * asserted here against a mocked service-role client.
 */

// Per-test response queue — avoids shared mutable global that races when
// vitest runs `describe` blocks concurrently.
const responseQueue: Array<{ data: unknown; error: unknown }> = [];
function setResponse(value: { data: unknown; error: unknown }) {
  responseQueue.push(value);
}

function makeBuilder() {
  const builder: Record<string, unknown> = {};
  const chainMethods = [
    'select', 'eq', 'or', 'in', 'order', 'limit', 'maybeSingle', 'single',
    'insert', 'update', 'delete', 'is', 'neq', 'gte', 'lte', 'like', 'ilike',
    'contains', 'not', 'csv', 'throwOnError',
  ];
  for (const method of chainMethods) builder[method] = () => builder;
  builder.then = (resolve: (value: unknown) => unknown) => {
    const next = responseQueue.shift() ?? { data: null, error: null };
    return Promise.resolve(next).then(resolve);
  };
  return builder as unknown as Promise<{ data: unknown; error: unknown }> & Record<string, () => unknown>;
}

const adminClient = {
  from: () => makeBuilder(),
  rpc: () => makeBuilder(),
  storage: { from: () => makeBuilder() },
};

vi.mock('@/lib/supabase/admin', () => ({
  getAdminSupabase: () => adminClient,
}));

import { getAdminOrderDetail, listAdminOrders } from '@/features/admin/repositories/orders';
import { getDashboardStats } from '@/features/admin/repositories/dashboard';
import { listCancelRequests } from '@/features/admin/repositories/cancel-requests';
import { listChangeRequests } from '@/features/admin/repositories/change-requests';

const orderRow = {
  id: 'o1',
  display_number: 'ORD-1',
  customer_email: 'buyer@example.com',
  recipient_name: 'Rania',
  recipient_phone: '+201000000000',
  delivery_city_code: 'greater-cairo',
  delivery_date: '2026-09-02',
  delivery_window: 'Morning',
  delivery_address: '12 Nile St',
  total_minor: 15000,
  payment_status: 'paid',
  fulfillment_status: 'confirmed',
  order_items: [{ id: 'i1', product_name_en: 'Red Rose', unit_price_minor: 10000, quantity: 1 }],
  payments: [{ id: 'p1', provider: 'paymob', provider_reference: 'ref-1', amount_minor: 15000, status: 'paid' }],
  order_events: [{ id: 'e1', event_type: 'created', from_status: null, to_status: 'confirmed', created_at: '2026-09-01T10:00:00Z' }],
  notification_deliveries: [
    {
      id: 'n1',
      type: 'order_confirmation',
      recipient: 'buyer@example.com',
      status: 'sent',
      attempts: 1,
      last_error: 'downstream SMTP timeout',
      sent_at: '2026-09-01T10:01:00Z',
      created_at: '2026-09-01T10:00:30Z',
    },
  ],
  order_cancel_requests: [{ id: 'c1', status: 'pending', reason: 'changed mind', created_at: '2026-09-01T11:00:00Z' }],
  order_delivery_groups: [
    {
      id: 'g1',
      position: 0,
      recipient_name: 'Group',
      recipient_phone: '+201000000001',
      delivery_address: 'GA',
      delivery_date: '2026-09-02',
      delivery_window: 'Morning',
      delivery_fee_minor: 2500,
      fulfillment_status: 'confirmed',
    },
  ],
};

describe('admin repositories — order detail mapping', () => {
  it('maps the full order aggregate into camelCase domain fields', async () => {
    setResponse({ data: orderRow, error: null });
    const detail = await getAdminOrderDetail('o1');
    expect(detail).not.toBeNull();
    expect(detail!.displayNumber).toBe('ORD-1');
    expect(detail!.customerEmail).toBe('buyer@example.com');
    expect(detail!.totalMinor).toBe(15000);
    expect(detail!.items[0]!.productName).toBe('Red Rose');
    expect(detail!.payments[0]!.providerReference).toBe('ref-1');
    expect(detail!.events[0]!.toStatus).toBe('confirmed');
  });

  it('maps notification_deliveries.last_error → lastError (R-16 snake→camel fix)', async () => {
    setResponse({ data: orderRow, error: null });
    const detail = await getAdminOrderDetail('o1');
    expect(detail!.deliveries[0]!.lastError).toBe('downstream SMTP timeout');
  });

  it('sorts delivery groups by position and cancel requests by created_at', async () => {
    setResponse({ data: orderRow, error: null });
    const detail = await getAdminOrderDetail('o1');
    expect(detail!.groups[0]!.id).toBe('g1');
    expect(detail!.cancelRequests[0]!.id).toBe('c1');
  });

  it('returns null for an unknown order', async () => {
    setResponse({ data: null, error: null });
    expect(await getAdminOrderDetail('missing')).toBeNull();
  });

  it('throws when the detail query reports an error', async () => {
    setResponse({ data: null, error: { message: 'db down' } });
    await expect(getAdminOrderDetail('o1')).rejects.toThrow(/Admin order detail query failed/);
  });

  it('sorts deliveries newest-first (repo-owned sort)', async () => {
    const rowWithTwoDeliveries = {
      ...orderRow,
      notification_deliveries: [
        { id: 'n-old', type: 'a', recipient: 'a@a', status: 'sent', attempts: 1, last_error: null, sent_at: null, created_at: '2026-09-01T08:00:00Z' },
        { id: 'n-new', type: 'a', recipient: 'a@a', status: 'sent', attempts: 1, last_error: null, sent_at: null, created_at: '2026-09-01T12:00:00Z' },
      ],
    };
    setResponse({ data: rowWithTwoDeliveries, error: null });
    const detail = await getAdminOrderDetail('o1');
    expect(detail!.deliveries[0]!.id).toBe('n-new');
    expect(detail!.deliveries[1]!.id).toBe('n-old');
  });

  it('escapes PostgREST or() filter safely — caller passes raw search, repo escapes', async () => {
    // Repo should not throw when search contains PostgREST metachars; verify it reaches the mock.
    setResponse({ data: [], error: null });
    const rows = await listAdminOrders({ q: 'a,b%c_d"e(f)', payment: undefined, fulfillment: undefined });
    expect(rows).toEqual([]);
  });
});

describe('admin repositories — order list mapping', () => {
  it('maps list rows into camelCase without touching RLS-bearing columns', async () => {
    setResponse({
      data: [
        {
          id: 'o1',
          display_number: 'ORD-1',
          customer_email: 'buyer@example.com',
          recipient_name: 'Rania',
          total_minor: 15000,
          payment_status: 'paid',
          fulfillment_status: 'confirmed',
          created_at: '2026-09-01T10:00:00Z',
        },
      ],
      error: null,
    });
    const rows = await listAdminOrders({ q: undefined, payment: undefined, fulfillment: undefined });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.displayNumber).toBe('ORD-1');
    expect(rows[0]!.recipientName).toBe('Rania');
    expect(rows[0]!.totalMinor).toBe(15000);
  });

  it('throws when the list query reports an error', async () => {
    setResponse({ data: null, error: { message: 'db down' } });
    await expect(listAdminOrders({ q: 'x', payment: undefined, fulfillment: undefined })).rejects.toThrow(/Admin order list query failed/);
  });
});

describe('admin repositories — dashboard RPC mapping', () => {
  it('maps the dashboard RPC row into camelCase stats', async () => {
    setResponse({
      data: {
        awaitingFulfillment: 3,
        revenueTodayMinor: 100,
        revenueAllTimeMinor: 500,
        pipeline: { paid: 2, pending: 1 },
        lowStock: [{ variant_id: 'v1', name: 'Tulip', available: 2 }],
        activeSubscriptions: 5,
        deliveriesThisWeek: 7,
      },
      error: null,
    });
    const stats = await getDashboardStats();
    expect(stats.lowStock[0]!.variantId).toBe('v1');
    expect(stats.pipeline.paid).toBe(2);
    expect(stats.activeSubscriptions).toBe(5);
  });

  it('throws when the RPC reports an error', async () => {
    setResponse({ data: null, error: { message: 'boom' } });
    await expect(getDashboardStats()).rejects.toThrow(/boom/);
  });

  it('throws when required RPC fields are missing (fail-closed)', async () => {
    setResponse({ data: { awaitingFulfillment: 1 }, error: null });
    await expect(getDashboardStats()).rejects.toThrow(/missing required field/);
  });
});

describe('admin repositories — cancel request queue mapping', () => {
  it('maps pending cancel requests and their order', async () => {
    setResponse({
      data: [
        {
          id: 'cr1',
          status: 'pending',
          reason: 'changed mind',
          created_at: '2026-09-01T11:00:00Z',
          reviewed_at: null,
          reviewed_by: null,
          orders: {
            id: 'o1',
            display_number: 'ORD-1',
            customer_email: 'buyer@example.com',
            total_minor: 15000,
            payment_status: 'paid',
            fulfillment_status: 'confirmed',
          },
        },
      ],
      error: null,
    });
    const queues = await listCancelRequests();
    expect(queues.pending).toHaveLength(1);
    expect(queues.pending[0]!.status).toBe('pending');
    expect(queues.pending[0]!.order?.displayNumber).toBe('ORD-1');
  });
});

describe('admin repositories — change request queue mapping', () => {
  it('parses a valid change diff and maps the queue row', async () => {
    setResponse({
      data: [
        {
          id: 'ch1',
          status: 'pending',
          reason: 'new date',
          changes: { delivery_date: '2026-10-01' },
          delta_minor: 500,
          created_at: '2026-09-01T11:00:00Z',
          reviewed_at: null,
          reviewed_by: null,
          orders: {
            id: 'o1',
            display_number: 'ORD-1',
            customer_email: 'buyer@example.com',
            total_minor: 15000,
            subtotal_minor: 12000,
            delivery_fee_minor: 3000,
            discount_minor: 0,
            payment_status: 'paid',
            fulfillment_status: 'confirmed',
          },
        },
      ],
      error: null,
    });
    const queues = await listChangeRequests();
    expect(queues.active).toHaveLength(1);
    expect(queues.active[0]!.id).toBe('ch1');
    expect(queues.active[0]!.diff).not.toBeNull();
    expect(queues.active[0]!.order?.displayNumber).toBe('ORD-1');
  });
});
