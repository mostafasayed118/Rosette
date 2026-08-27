import { describe, expect, it, vi } from 'vitest';
import { updateGroupFulfillmentStatus } from '@/features/admin/order-actions';
import type { FulfillmentStatus } from '@/features/commerce/order-state';

const admin = { userId: 'admin-1', role: 'admin' as const };

function fakeClient(seed: { groupRow?: Record<string, unknown> | null; groupRows?: Array<Record<string, unknown>> }) {
  const groupUpdate = vi.fn(() => ({ eq: async () => ({ error: null }) }));
  const eventsInsert = vi.fn(async () => ({ error: null }));
  const auditInsert = vi.fn(async () => ({ error: null }));
  const orderUpdate = vi.fn(() => ({ eq: async () => ({ error: null }) }));
  const from = (table: string) => {
    if (table === 'order_delivery_groups') {
      return {
        select: (columns: string) => ({
          eq: () => (columns.includes('position')
            ? { order: async () => ({ data: seed.groupRows ?? [], error: null }) }
            : { maybeSingle: async () => ({ data: seed.groupRow ?? null, error: null }) }),
        }),
        update: groupUpdate,
      };
    }
    if (table === 'order_events') return { insert: eventsInsert };
    if (table === 'admin_audit_logs') return { insert: auditInsert };
    if (table === 'orders') return { update: orderUpdate };
    return {};
  };
  return { client: { from } as never, groupUpdate, eventsInsert, auditInsert, orderUpdate };
}

describe('updateGroupFulfillmentStatus', () => {
  it('rejects a missing group', async () => {
    const { client } = fakeClient({ groupRow: null });
    const result = await updateGroupFulfillmentStatus(client, { admin, orderId: 'o1', groupId: 'g1', status: 'delivered', orderUrlBase: 'http://x' });
    expect(result).toBe('missing_order');
  });

  it('returns invalid_or_unauthorized on an illegal transition', async () => {
    const { client } = fakeClient({ groupRow: { id: 'g1', fulfillment_status: 'delivered', order_id: 'o1' } });
    const result = await updateGroupFulfillmentStatus(client, { admin, orderId: 'o1', groupId: 'g1', status: 'preparing', orderUrlBase: 'http://x' });
    expect(result).toBe('invalid_or_unauthorized');
  });

  it('updates the group, logs events, and recomputes the derived order status', async () => {
    const { client, groupUpdate, eventsInsert, auditInsert, orderUpdate } = fakeClient({
      groupRow: { id: 'g1', fulfillment_status: 'confirmed', order_id: 'o1' },
      groupRows: [
        { id: 'g1', position: 0, fulfillment_status: 'preparing' as FulfillmentStatus },
        { id: 'g2', position: 1, fulfillment_status: 'confirmed' as FulfillmentStatus },
      ],
    });
    const result = await updateGroupFulfillmentStatus(client, { admin, orderId: 'o1', groupId: 'g1', status: 'preparing', orderUrlBase: 'http://x' });
    expect(result).toBe('updated');
    expect(groupUpdate).toHaveBeenCalledWith(expect.objectContaining({ fulfillment_status: 'preparing' }));
    expect(eventsInsert).toHaveBeenCalledWith(expect.objectContaining({ order_id: 'o1', to_status: 'preparing' }));
    expect(auditInsert).toHaveBeenCalledWith(expect.objectContaining({ action: 'update_order_group_status' }));
    expect(orderUpdate).toHaveBeenCalledWith(expect.objectContaining({ fulfillment_status: 'confirmed' }));
  });
});
