import { describe, expect, it } from 'vitest';
import { validateOrderRequest } from '@/features/order/order-request';

describe('order request validation', () => {
  it('rejects an empty cart', () => {
    expect(validateOrderRequest({ cart: { lines: [] } })).toEqual({ ok: false, error: 'empty_cart' });
  });

  it('rejects a client-supplied total', () => {
    expect(validateOrderRequest({ cart: { lines: [{ productSlug: 'rose-hour' }] }, total: 1 })).toEqual({ ok: false, error: 'client_total_not_allowed' });
  });
});
