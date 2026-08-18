import { describe, expect, it } from 'vitest';
import { isStuckRow } from '@/features/notifications/notification-retry';
import { listStuckDeliveries } from '@/features/admin/notification-admin';

type DeliveryRow = { id: string; order_id: string; type: string; recipient: string; locale: string; status: string; attempts: number; last_error: string | null; created_at: string };
type OrderRow = { id: string; display_number: string };

function fakeClient(rows: DeliveryRow[], orders: OrderRow[]) {
  const from = (table: string) => {
    if (table === 'notification_deliveries') {
      return { select: () => ({ in: () => ({ data: rows, error: null }) }) };
    }
    return { select: () => ({ in: () => ({ data: orders, error: null }) }) };
  };
  return { from };
}

const now = () => new Date('2026-08-18T12:00:00.000Z');
const row = (over: Partial<DeliveryRow> = {}): DeliveryRow => ({
  id: 'd1', order_id: 'o1', type: 'delivered', recipient: 'buyer@example.com', locale: 'en', status: 'failed', attempts: 1, last_error: 'smtp_failed', created_at: '2026-08-18T00:00:00.000Z', ...over,
});

describe('isStuckRow', () => {
  it('flags failed rows under the attempt limit and stale pending rows', () => {
    expect(isStuckRow({ status: 'failed', attempts: 2, created_at: 'x' }, now())).toBe(true);
    expect(isStuckRow({ status: 'pending', attempts: 0, created_at: '2026-08-18T11:44:00.000Z' }, now())).toBe(true);
  });

  it('rejects failed rows at the limit and fresh pending rows', () => {
    expect(isStuckRow({ status: 'failed', attempts: 3, created_at: 'x' }, now())).toBe(false);
    expect(isStuckRow({ status: 'pending', attempts: 0, created_at: '2026-08-18T11:50:00.000Z' }, now())).toBe(false);
    expect(isStuckRow({ status: 'sent', attempts: 0, created_at: 'x' }, now())).toBe(false);
  });
});

const stuckRows = [
  row({ id: 'd1', order_id: 'o1', type: 'delivered', status: 'failed', attempts: 1, recipient: 'buyer@example.com', created_at: '2026-08-18T00:00:00.000Z' }),
  row({ id: 'd2', order_id: 'o2', type: 'order_received', status: 'pending', attempts: 0, recipient: 'alice@example.com', created_at: '2026-08-18T11:44:00.000Z' }),
  row({ id: 'd3', order_id: 'o3', type: 'payment_failed', status: 'failed', attempts: 2, recipient: 'carol@example.com', created_at: '2026-08-18T10:00:00.000Z' }),
];
const orders = [
  { id: 'o1', display_number: 'RO-1' },
  { id: 'o2', display_number: 'RO-2' },
  { id: 'o3', display_number: 'RO-3' },
];

describe('listStuckDeliveries', () => {
  it('returns only stuck rows sorted newest-first with their order number and total', async () => {
    const { rows, total } = await listStuckDeliveries(fakeClient(stuckRows, orders), { now });
    expect(rows.map((r) => r.id)).toEqual(['d2', 'd3', 'd1']);
    expect(total).toBe(3);
    expect(rows[2]!.orderNumber).toBe('RO-1');
    expect(rows[2]!.lastError).toBe('smtp_failed');
  });

  it('leaves orderNumber null when the order is missing', async () => {
    const { rows } = await listStuckDeliveries(fakeClient([row()], []), { now });
    expect(rows[0]!.orderNumber).toBeNull();
  });

  it('searches by order number case-insensitively', async () => {
    const { rows, total } = await listStuckDeliveries(fakeClient(stuckRows, orders), { now, q: 'ro-2' });
    expect(rows.map((r) => r.id)).toEqual(['d2']);
    expect(total).toBe(1);
  });

  it('searches by recipient email', async () => {
    const { rows } = await listStuckDeliveries(fakeClient(stuckRows, orders), { now, q: 'carol@' });
    expect(rows.map((r) => r.id)).toEqual(['d3']);
  });

  it('filters by status', async () => {
    const { rows } = await listStuckDeliveries(fakeClient(stuckRows, orders), { now, status: 'pending' });
    expect(rows.map((r) => r.id)).toEqual(['d2']);
  });

  it('filters by email type', async () => {
    const { rows } = await listStuckDeliveries(fakeClient(stuckRows, orders), { now, type: 'delivered' });
    expect(rows.map((r) => r.id)).toEqual(['d1']);
  });

  it('paginates after filtering and reports the unfiltered total', async () => {
    const { rows, total } = await listStuckDeliveries(fakeClient(stuckRows, orders), { now, page: 2, pageSize: 2 });
    expect(rows.map((r) => r.id)).toEqual(['d1']);
    expect(total).toBe(3);
  });

  it('ignores invalid status/type and clamps page to at least 1', async () => {
    const { rows, total } = await listStuckDeliveries(fakeClient(stuckRows, orders), { now, status: 'bogus', type: 'bogus', page: 0 });
    expect(rows).toHaveLength(3);
    expect(total).toBe(3);
  });
});
