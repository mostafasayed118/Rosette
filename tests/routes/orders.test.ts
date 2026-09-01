import { describe, expect, it } from 'vitest';
import { validateOrderRequest } from '@/features/order/order-request';

describe('order request validation', () => {
  it('rejects an empty cart', () => {
    expect(validateOrderRequest({ cart: { lines: [] } })).toEqual({ ok: false, error: 'empty_cart' });
  });

  it('rejects a client-supplied total', () => {
    expect(validateOrderRequest({ cart: { lines: [{ productSlug: 'rose-hour' }] }, total: 1 })).toEqual({ ok: false, error: 'client_total_not_allowed' });
  });

  it('requires bounded positive integer quantities', () => {
    expect(validateOrderRequest({ cart: { lines: [{ productSlug: 'rose-hour', quantity: 0 }] } })).toEqual({ ok: false, error: 'invalid_quantity' });
    expect(validateOrderRequest({ cart: { lines: [{ productSlug: 'rose-hour', quantity: 1.5 }] } })).toEqual({ ok: false, error: 'invalid_quantity' });
    expect(validateOrderRequest({ cart: { lines: [{ productSlug: 'rose-hour', quantity: 21 }] } })).toEqual({ ok: false, error: 'invalid_quantity' });
    expect(validateOrderRequest({ cart: { lines: [{ productSlug: 'rose-hour', quantity: 2 }] } })).toEqual({ ok: true });
  });

  it('rejects Friday delivery dates at the server boundary', () => {
    expect(validateOrderRequest({
      cart: { lines: [{ productSlug: 'rose-hour', quantity: 1 }] },
      checkout: { deliveryDate: '2026-09-04' },
    })).toEqual({ ok: false, error: 'undeliverable_date' });
  });

  it('validates every multi-recipient delivery date', () => {
    expect(validateOrderRequest({
      cart: { lines: [{ productSlug: 'rose-hour', quantity: 1 }] },
      recipients: [{ deliveryDate: '2026-09-05' }, { deliveryDate: '2026-09-04' }],
    })).toEqual({ ok: false, error: 'undeliverable_date' });
  });
});
