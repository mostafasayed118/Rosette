import { describe, expect, it } from 'vitest';
import { deriveOrderStatus, normalizeGroups, type DeliveryGroup } from '@/features/order/delivery-groups';

function group(status: DeliveryGroup['fulfillmentStatus']): Pick<DeliveryGroup, 'fulfillmentStatus'> {
  return { fulfillmentStatus: status };
}

describe('delivery groups', () => {
  it('deriveOrderStatus: all cancelled => cancelled', () => {
    expect(deriveOrderStatus([group('cancelled'), group('cancelled')])).toBe('cancelled');
  });

  it('deriveOrderStatus: all delivered => delivered', () => {
    expect(deriveOrderStatus([group('delivered'), group('delivered')])).toBe('delivered');
  });

  it('deriveOrderStatus: mixed in-progress => least progressed non-cancelled', () => {
    expect(deriveOrderStatus([group('confirmed'), group('out_for_delivery')])).toBe('confirmed');
    expect(deriveOrderStatus([group('preparing'), group('delivered')])).toBe('preparing');
    expect(deriveOrderStatus([group('ready_for_delivery'), group('out_for_delivery')])).toBe('ready_for_delivery');
  });

  it('deriveOrderStatus: cancelled + delivered yields delivered only if all non-cancelled delivered', () => {
    expect(deriveOrderStatus([group('cancelled'), group('delivered')])).toBe('delivered');
    expect(deriveOrderStatus([group('cancelled'), group('preparing')])).toBe('preparing');
  });

  it('deriveOrderStatus: empty groups => confirmed', () => {
    expect(deriveOrderStatus([])).toBe('confirmed');
  });

  it('normalizeGroups falls back to a single synthetic group from order columns', () => {
    const order = { recipient_name: 'Mom', recipient_phone: '0100', delivery_address: 'Cairo', delivery_date: '2026-09-02', delivery_window: '12-3', delivery_fee_minor: 1500, fulfillment_status: 'confirmed' };
    const groups = normalizeGroups(order, []);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.recipientName).toBe('Mom');
    expect(groups[0]!.fulfillmentStatus).toBe('confirmed');
    expect(groups[0]!.publicToken).toBeNull();
  });

  it('normalizeGroups passes the real group list through when present', () => {
    const order = {};
    const real: DeliveryGroup[] = [{ id: 'g1', position: 0, recipientName: 'Mom', recipientPhone: '0100', deliveryAddress: 'Cairo', deliveryDate: '2026-09-02', deliveryWindow: '12-3', deliveryFeeMinor: 1500, fulfillmentStatus: 'preparing', publicToken: 'abc', cancelledAt: null, items: [] }];
    const groups = normalizeGroups(order, real);
    expect(groups).toBe(real);
  });
});
