import { describe, expect, it } from 'vitest';
import { buildOrderListQuery } from '@/features/admin/order-list-query';

describe('buildOrderListQuery', () => {
  it('maps a trimmed search term', () => {
    expect(buildOrderListQuery({ q: '  RO-123  ' })).toEqual({ search: 'RO-123' });
  });

  it('keeps valid status filters', () => {
    expect(buildOrderListQuery({ payment: 'paid', fulfillment: 'out_for_delivery' })).toEqual({ paymentStatus: 'paid', fulfillmentStatus: 'out_for_delivery' });
  });

  it('ignores invalid status values and empty params', () => {
    expect(buildOrderListQuery({ q: '', payment: 'bogus', fulfillment: 'nope' })).toEqual({});
  });
});
