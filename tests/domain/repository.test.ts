import { describe, expect, it } from 'vitest';
import { createLocalOrder } from '@/features/order/repository';
import type { CreateOrderInput } from '@/features/order/types';

const input: CreateOrderInput = { cart: { lines: [{ id: 'rose', productSlug: 'rose-hour', productName: 'Rose Hour', tone: '#bc6d63', unitPrice: 12000, quantity: 1, addOns: [], message: '', deliveryDate: '2026-08-20' }] }, destination: { countryCode: 'EG', cityCode: 'alexandria' }, recipient: { name: 'Maya', phone: '01000000000' }, sender: { name: 'Nour', email: 'nour@example.com' }, delivery: { address: '12 Garden Street', date: '2026-08-20', window: '12-3' }, paymentMethod: 'demo-card', simulatePaymentFailure: false };

describe('local order repository', () => {
  it('stores a confirmed order after successful mock authorization', () => {
    const result = createLocalOrder(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe('confirmed');
      expect(result.value.displayNumber).toMatch(/^RO-/);
    }
  });

  it('does not store an order when mock authorization fails', () => {
    const result = createLocalOrder({ ...input, simulatePaymentFailure: true });
    expect(result).toEqual({ ok: false, error: 'payment_failed' });
  });
});
