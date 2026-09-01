import { describe, expect, it, vi } from 'vitest';
import { isStuckRow } from '@/features/notifications/notification-retry';
import { listStuckDeliveries } from '@/features/admin/notification-admin';

type RpcRow = {
  id: string;
  type: string;
  recipient: string;
  locale: string;
  status: string;
  attempts: number;
  last_error: string | null;
  created_at: string;
  order_number: string | null;
};

// The implementation now delegates filtering/sorting/pagination to the
// `admin_notification_deliveries` / `admin_notification_deliveries_count`
// SQL RPCs (R-12). The mock therefore emulates the *server* response and we
// assert the function forwards the right params and maps the rows.
function fakeClient(rpc: ReturnType<typeof vi.fn>): any {
  return { from: vi.fn(), rpc };
}

function rpcReturning(rows: RpcRow[], total: number) {
  return vi.fn(async (name: string) => {
    if (name === 'admin_notification_deliveries_count') return { data: total, error: null };
    return { data: rows, error: null };
  });
}

const now = () => new Date('2026-08-18T12:00:00.000Z');

const serverRows: RpcRow[] = [
  { id: 'd1', type: 'delivered', recipient: 'buyer@example.com', locale: 'en', status: 'failed', attempts: 1, last_error: 'smtp_failed', created_at: '2026-08-18T00:00:00.000Z', order_number: 'RO-1' },
  { id: 'd2', type: 'order_received', recipient: 'alice@example.com', locale: 'en', status: 'pending', attempts: 0, last_error: null, created_at: '2026-08-18T11:44:00.000Z', order_number: 'RO-2' },
  { id: 'd3', type: 'payment_failed', recipient: 'carol@example.com', locale: 'en', status: 'failed', attempts: 2, last_error: null, created_at: '2026-08-18T10:00:00.000Z', order_number: 'RO-3' },
];

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
  it('maps RPC rows (snake_case server fields) and reads total from the count call', async () => {
    const rpc = rpcReturning(serverRows, 3);
    const { rows, total } = await listStuckDeliveries(fakeClient(rpc), { now });

    expect(rpc).toHaveBeenCalledWith('admin_notification_deliveries', expect.objectContaining({
      p_q: null, p_status: null, p_type: null, p_page_size: 10, p_page_offset: 0,
    }));
    expect(rpc).toHaveBeenCalledWith('admin_notification_deliveries_count', expect.objectContaining({
      p_q: null, p_status: null, p_type: null,
    }));
    expect(rows.map((r) => r.id)).toEqual(['d1', 'd2', 'd3']);
    expect(rows[0]!.orderNumber).toBe('RO-1');
    expect(rows[0]!.lastError).toBe('smtp_failed');
    expect(total).toBe(3);
  });

  it('forwards status/type/q filters to the RPCs', async () => {
    const rpc = rpcReturning([], 0);
    await listStuckDeliveries(fakeClient(rpc), { now, q: 'ro-2', status: 'pending', type: 'delivered' });
    expect(rpc).toHaveBeenCalledWith('admin_notification_deliveries', expect.objectContaining({
      p_q: 'ro-2', p_status: 'pending', p_type: 'delivered',
    }));
  });

  it('ignores invalid status/type (sent as null) in the RPC params', async () => {
    const rpc = rpcReturning([], 0);
    await listStuckDeliveries(fakeClient(rpc), { now, status: 'bogus', type: 'bogus' });
    expect(rpc).toHaveBeenCalledWith('admin_notification_deliveries', expect.objectContaining({
      p_status: null, p_type: null,
    }));
  });

  it('clamps page to at least 1 and computes the SQL offset', async () => {
    const rpc = rpcReturning([], 0);
    await listStuckDeliveries(fakeClient(rpc), { now, page: 0, pageSize: 2 });
    expect(rpc).toHaveBeenCalledWith('admin_notification_deliveries', expect.objectContaining({
      p_page_size: 2, p_page_offset: 0,
    }));
  });

  it('computes the page offset for page 2', async () => {
    const rpc = rpcReturning([], 0);
    await listStuckDeliveries(fakeClient(rpc), { now, page: 2, pageSize: 2 });
    expect(rpc).toHaveBeenCalledWith('admin_notification_deliveries', expect.objectContaining({
      p_page_offset: 2,
    }));
  });

  it('maps a null order_number to a null orderNumber', async () => {
    const rpc = rpcReturning([{ ...serverRows[0]!, order_number: null }], 1);
    const { rows } = await listStuckDeliveries(fakeClient(rpc), { now });
    expect(rows[0]!.orderNumber).toBeNull();
  });
});
