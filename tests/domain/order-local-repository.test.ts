import { describe, expect, it, beforeEach, vi } from 'vitest';
import type { Cart } from '@/features/cart/types';

const STORAGE_KEY = 'rosette.orders.v1';

const cart: Cart = { version: 2, lines: [{ id: 'l1', productSlug: 'rose-hour', productName: 'Rose Hour', tone: '#bc6d63', unitPrice: 12000, quantity: 1, addOns: [], message: '', deliveryDate: '2026-08-20' }], recipients: [] };

beforeEach(() => {
  if (typeof window !== 'undefined') window.localStorage.clear();
  vi.resetModules();
});

describe('local order repository PendingOrder shape', () => {
  it('returns the same field set as the Supabase path so callers can rely on the contract', async () => {
    const { getOrderRepository } = await import('@/features/order/provider');
    const repo = getOrderRepository();
    const result = await repo.createPending({
      cart,
      destination: { countryCode: 'EG', cityCode: 'cairo' },
      checkout: {
        senderName: 'Maya',
        senderEmail: 'maya@example.com',
        recipientName: 'Nour',
        recipientPhone: '+20100',
        address: '1 Nile St',
        deliveryDate: '2026-08-20',
        deliveryWindow: '12-3',
        paymentMethod: 'paymob',
      },
      locale: 'en',
      customerId: null,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // All keys the Supabase path returns must be present here, even when the
    // value is null/undefined, so destructuring on the route never throws.
    const value = result.value as Record<string, unknown>;
    expect(value).toHaveProperty('id');
    expect(value).toHaveProperty('displayNumber');
    expect(value).toHaveProperty('totalMinor');
    expect(value).toHaveProperty('subtotalMinor');
    expect(value).toHaveProperty('deliveryFeeMinor');
    expect(value).toHaveProperty('discountMinor');
    expect(value).toHaveProperty('giftCardMinor');
    expect(value).toHaveProperty('giftCardId');
    expect(value).toHaveProperty('giftCardHoldId');
    expect(value).toHaveProperty('giftCardCodeLast4');
    expect(value).toHaveProperty('publicToken');
    expect(value).toHaveProperty('paymentStatus');
    expect(value).toHaveProperty('fulfillmentStatus');
    // localStorage should not retain the order — local repos are demo-only.
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeTruthy();
  });
});
