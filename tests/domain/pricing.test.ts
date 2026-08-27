import { describe, expect, it } from 'vitest';
import { calculateCartTotals, calculateLineTotal } from '@/features/cart/pricing';
import { addLine, removeLine, updateLineQuantity } from '@/features/cart/cart-utils';
import type { Cart, CartLine } from '@/features/cart/types';

const line: CartLine = { id: 'rose-hour-classic', productSlug: 'rose-hour', productName: 'Rose Hour', tone: '#bc6d63', unitPrice: 12000, quantity: 2, variantName: 'Classic', addOns: [{ id: 'note', name: 'Handwritten note', price: 500 }], message: 'For you', deliveryDate: '2026-08-20' };
const cart: Cart = { version: 2, lines: [line], recipients: [] };

describe('cart pricing and mutations', () => {
  it('calculates add-ons and quantity in minor units', () => {
    expect(calculateLineTotal(line)).toBe(25000);
    expect(calculateCartTotals([line], 1500)).toEqual({ subtotal: 25000, deliveryFee: 1500, total: 26500 });
  });

  it('updates quantity and removes a line', () => {
    expect(updateLineQuantity(cart, line.id, 3).lines[0]?.quantity).toBe(3);
    expect(updateLineQuantity(cart, line.id, 0).lines).toHaveLength(0);
    expect(removeLine(cart, line.id).lines).toHaveLength(0);
  });

  it('creates a distinct line for different customization', () => {
    const next = addLine(cart, { ...line, id: 'rose-hour-generous', variantName: 'Generous', unitPrice: 16500, quantity: 1 });
    expect(next.lines).toHaveLength(2);
  });
});
