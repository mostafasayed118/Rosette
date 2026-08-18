import { describe, expect, it } from 'vitest';
import { deliverOrderNotification } from '@/features/notifications/notification-delivery';

type Call = { table: string; op: string; payload?: unknown; id?: string };

function fakeClient(options: { failInsert?: boolean } = {}) {
  const calls: Call[] = [];
  const from = (table: string) => ({
    insert: (payload: unknown) => {
      calls.push({ table, op: 'insert', payload });
      return {
        select: () => ({
          single: async () => (options.failInsert ? { data: null, error: { message: 'boom' } } : { data: { id: 'notif-1' }, error: null }),
        }),
      };
    },
    update: (payload: unknown) => ({
      eq: (id: string) => {
        calls.push({ table, op: 'update', payload, id });
        return { error: null };
      },
    }),
  });
  return { client: { from }, calls };
}

const input = {
  orderId: 'o1',
  type: 'ready_for_delivery' as const,
  recipient: 'buyer@example.com',
  locale: 'en' as const,
  orderNumber: 'RO-123',
  totalMinor: 12300,
  orderUrl: 'https://shop.example.com/orders/o1?token=tok',
};

const sendOk = async () => ({ accepted: true as const });

describe('deliverOrderNotification', () => {
  it('inserts a pending row, sends, and marks it sent with a timestamp', async () => {
    const { client, calls } = fakeClient();
    const result = await deliverOrderNotification(client, input, sendOk);
    expect(result).toEqual({ accepted: true });
    const inserted = calls.find((c) => c.table === 'notification_deliveries' && c.op === 'insert');
    expect(inserted!.payload).toMatchObject({ order_id: 'o1', type: 'ready_for_delivery', recipient: 'buyer@example.com', locale: 'en', status: 'pending' });
    const updated = calls.find((c) => c.table === 'notification_deliveries' && c.op === 'update');
    expect(updated!.payload).toMatchObject({ status: 'sent' });
    expect((updated!.payload as { sent_at?: string }).sent_at).toBeDefined();
  });

  it('marks the row failed when the send is not accepted', async () => {
    const { client, calls } = fakeClient();
    const sendFail = async () => ({ accepted: false as const, retryable: true as const });
    const result = await deliverOrderNotification(client, input, sendFail);
    expect(result).toEqual({ accepted: false });
    const updated = calls.find((c) => c.table === 'notification_deliveries' && c.op === 'update');
    expect(updated!.payload).toMatchObject({ status: 'failed', attempts: 1, last_error: 'smtp_failed' });
  });

  it('skips sending entirely when there is no recipient', async () => {
    const { client, calls } = fakeClient();
    const result = await deliverOrderNotification(client, { ...input, recipient: '' }, sendOk);
    expect(result).toEqual({ accepted: false });
    expect(calls).toEqual([]);
  });

  it('returns accepted false without sending when the insert fails', async () => {
    const { client, calls } = fakeClient({ failInsert: true });
    const result = await deliverOrderNotification(client, input, sendOk);
    expect(result).toEqual({ accepted: false });
    expect(calls.filter((c) => c.op === 'update')).toEqual([]);
  });
});
