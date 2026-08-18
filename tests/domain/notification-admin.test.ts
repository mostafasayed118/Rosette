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

describe('listStuckDeliveries', () => {
  it('returns only stuck rows with their order number', async () => {
    const rows = [
      row({ id: 'd1' }),
      row({ id: 'd2', order_id: 'o2', type: 'order_received', status: 'pending', attempts: 0, created_at: '2026-08-18T11:44:00.000Z' }),
      row({ id: 'd3', status: 'pending', attempts: 0, created_at: '2026-08-18T11:50:00.000Z' }),
      row({ id: 'd4', attempts: 3 }),
    ];
    const client = fakeClient(rows, [{ id: 'o1', display_number: 'RO-1' }, { id: 'o2', display_number: 'RO-2' }]);
    const result = await listStuckDeliveries(client, { now });
    expect(result.map((r) => r.id)).toEqual(['d1', 'd2']);
    expect(result[0]!.orderNumber).toBe('RO-1');
    expect(result[1]!).toMatchObject({ type: 'order_received', status: 'pending', attempts: 0, orderNumber: 'RO-2' });
    expect(result[0]!.lastError).toBe('smtp_failed');
  });

  it('leaves orderNumber null when the order is missing', async () => {
    const client = fakeClient([row()], []);
    const result = await listStuckDeliveries(client, { now });
    expect(result[0]!.orderNumber).toBeNull();
  });
});
