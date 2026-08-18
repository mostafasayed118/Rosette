import { describe, expect, it } from 'vitest';
import { updateFulfillmentStatus } from '@/features/admin/order-actions';

type OrderRow = { id: string; display_number: string; total_minor: number; public_token: string; customer_email: string | null; locale: 'en' | 'ar'; fulfillment_status: string };
type Call = { table: string; op: string; payload?: unknown; id?: string };

function fakeClient(seed: { order: OrderRow | null; failUpdate?: boolean }) {
  const calls: Call[] = [];
  const from = (table: string) => ({
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: seed.order, error: null }) }) }),
    update: (payload: unknown) => ({ eq: (id: string) => { calls.push({ table, op: 'update', payload, id }); return { error: seed.failUpdate ? { message: 'boom' } : null }; } }),
    insert: (payload: unknown) => { calls.push({ table, op: 'insert', payload }); return { select: () => ({ single: async () => ({ data: { id: 'notif-1' }, error: null }) }), eq: () => ({}) }; },
  });
  return { client: { from }, calls };
}

const admin = { userId: 'admin-1', role: 'admin' as const };
const baseOrder: OrderRow = { id: 'o1', display_number: 'RO-123', total_minor: 12300, public_token: 'tok', customer_email: 'buyer@example.com', locale: 'en', fulfillment_status: 'confirmed' };
const baseInput = { admin, orderId: 'o1', orderUrlBase: 'https://shop.example.com' };

const sendOk = async () => ({ accepted: true as const });

describe('updateFulfillmentStatus', () => {
  it('updates the order and writes event + audit, with no notification for non-milestones', async () => {
    const { client, calls } = fakeClient({ order: baseOrder });
    const result = await updateFulfillmentStatus(client, { ...baseInput, status: 'preparing' }, { sendNotification: sendOk });
    expect(result).toBe('updated');
    expect(calls.map((c) => `${c.table}:${c.op}`)).toEqual(expect.arrayContaining(['orders:update', 'order_events:insert', 'admin_audit_logs:insert']));
    expect(calls.find((c) => c.table === 'notification_deliveries')).toBeUndefined();
  });

  it('rejects an illegal transition with no writes', async () => {
    const { client, calls } = fakeClient({ order: { ...baseOrder, fulfillment_status: 'delivered' } });
    const result = await updateFulfillmentStatus(client, { ...baseInput, status: 'confirmed' }, { sendNotification: sendOk });
    expect(result).toBe('invalid_or_unauthorized');
    expect(calls).toEqual([]);
  });

  it('rejects a cancel by an operator', async () => {
    const operator = { userId: 'op-1', role: 'operator' as const };
    const { client, calls } = fakeClient({ order: baseOrder });
    const result = await updateFulfillmentStatus(client, { ...baseInput, admin: operator, status: 'cancelled' }, { sendNotification: sendOk });
    expect(result).toBe('invalid_or_unauthorized');
    expect(calls).toEqual([]);
  });

  it('returns missing_order when the order does not exist', async () => {
    const { client } = fakeClient({ order: null });
    const result = await updateFulfillmentStatus(client, { ...baseInput, status: 'preparing' }, { sendNotification: sendOk });
    expect(result).toBe('missing_order');
  });

  it('returns failure when the order update errors', async () => {
    const { client, calls } = fakeClient({ order: baseOrder, failUpdate: true });
    const result = await updateFulfillmentStatus(client, { ...baseInput, status: 'preparing' }, { sendNotification: sendOk });
    expect(result).toBe('failure');
    expect(calls.filter((c) => c.table === 'order_events')).toEqual([]);
  });

  it('enqueues and sends a milestone email for out_for_delivery', async () => {
    const { client, calls } = fakeClient({ order: { ...baseOrder, fulfillment_status: 'ready_for_delivery' } });
    const result = await updateFulfillmentStatus(client, { ...baseInput, status: 'out_for_delivery' }, { sendNotification: sendOk });
    expect(result).toBe('updated');
    const inserted = calls.find((c) => c.table === 'notification_deliveries' && c.op === 'insert');
    expect(inserted).toBeDefined();
    expect(inserted!.payload).toMatchObject({ order_id: 'o1', type: 'out_for_delivery', recipient: 'buyer@example.com', locale: 'en', status: 'pending' });
    const updated = calls.find((c) => c.table === 'notification_deliveries' && c.op === 'update');
    expect(updated).toBeDefined();
    expect(updated!.payload).toMatchObject({ status: 'sent' });
  });

  it('enqueues and sends a milestone email for ready_for_delivery', async () => {
    const { client, calls } = fakeClient({ order: { ...baseOrder, fulfillment_status: 'preparing' } });
    const result = await updateFulfillmentStatus(client, { ...baseInput, status: 'ready_for_delivery' }, { sendNotification: sendOk });
    expect(result).toBe('updated');
    const inserted = calls.find((c) => c.table === 'notification_deliveries' && c.op === 'insert');
    expect(inserted).toBeDefined();
    expect(inserted!.payload).toMatchObject({ order_id: 'o1', type: 'ready_for_delivery', recipient: 'buyer@example.com', locale: 'en', status: 'pending' });
    const updated = calls.find((c) => c.table === 'notification_deliveries' && c.op === 'update');
    expect(updated).toBeDefined();
    expect(updated!.payload).toMatchObject({ status: 'sent' });
  });

  it('marks the notification failed but still succeeds the transition when the email send fails', async () => {
    const { client, calls } = fakeClient({ order: { ...baseOrder, fulfillment_status: 'ready_for_delivery' } });
    const sendFail = async () => ({ accepted: false as const, retryable: true as const });
    const result = await updateFulfillmentStatus(client, { ...baseInput, status: 'out_for_delivery' }, { sendNotification: sendFail });
    expect(result).toBe('updated');
    const updated = calls.find((c) => c.table === 'notification_deliveries' && c.op === 'update');
    expect(updated!.payload).toMatchObject({ status: 'failed' });
  });

  it('does not enqueue a notification when the order has no email', async () => {
    const { client, calls } = fakeClient({ order: { ...baseOrder, customer_email: null, fulfillment_status: 'ready_for_delivery' } });
    const result = await updateFulfillmentStatus(client, { ...baseInput, status: 'out_for_delivery' }, { sendNotification: sendOk });
    expect(result).toBe('updated');
    expect(calls.find((c) => c.table === 'notification_deliveries')).toBeUndefined();
  });
});
