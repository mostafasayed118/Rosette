import { describe, expect, it } from 'vitest';
import { buildOrderInsertRow } from '@/features/order/order-insert';

const base = {
  number: 'RO-1', publicToken: 'tok', customerEmail: 'a@b.c', customerPhone: '0100',
  recipientName: 'Maya', recipientPhone: '0100', deliveryAddress: 'addr', deliveryCityCode: 'alexandria',
  deliveryDate: '2026-08-20', deliveryWindow: '12-3', locale: 'en', subtotalMinor: 10000,
  deliveryFeeMinor: 1500, discountMinor: 0, promoCode: null, totalMinor: 11500,
};

describe('buildOrderInsertRow', () => {
  it('sets customer_id when provided', () => {
    expect(buildOrderInsertRow({ ...base, customerId: 'u1' }).customer_id).toBe('u1');
  });

  it('sets customer_id to null when absent', () => {
    expect(buildOrderInsertRow(base).customer_id).toBeNull();
  });
});
