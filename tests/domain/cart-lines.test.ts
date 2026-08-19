import { describe, expect, it } from 'vitest';
import { validateCartLines } from '@/features/cart/cart-lines';
import type { CartLine } from '@/features/cart/types';

const base: CartLine = {
  id: 'l1', productSlug: 'rose-hour', productName: 'Rose Hour', tone: '#bc6d63',
  unitPrice: 12000, quantity: 1, addOns: [], message: '', deliveryDate: '2026-08-20',
};

describe('validateCartLines', () => {
  it('accepts a well-formed line array', () => {
    expect(validateCartLines([base])).toEqual([base]);
  });

  it('accepts lines with add-ons and optional display fields', () => {
    const line: CartLine = { ...base, variantId: 'v1', variantName: 'Classic', imageUrl: null,
      addOns: [{ id: 'note', name: 'Note', price: 500 }] };
    expect(validateCartLines([line])).toEqual([line]);
  });

  it('rejects a non-array', () => {
    expect(validateCartLines('nope')).toBeNull();
  });

  it('rejects an empty array', () => {
    expect(validateCartLines([])).toBeNull();
  });

  it('rejects a line missing a product slug', () => {
    expect(validateCartLines([{ ...base, productSlug: '' }])).toBeNull();
  });

  it('rejects a non-positive or non-integer quantity', () => {
    expect(validateCartLines([{ ...base, quantity: 0 }])).toBeNull();
    expect(validateCartLines([{ ...base, quantity: 1.5 }])).toBeNull();
  });

  it('rejects a negative or non-numeric unit price', () => {
    expect(validateCartLines([{ ...base, unitPrice: -1 }])).toBeNull();
    expect(validateCartLines([{ ...base, unitPrice: Number.NaN }])).toBeNull();
  });

  it('rejects more lines than the cap', () => {
    const lines = Array.from({ length: 21 }, (_, i) => ({ ...base, id: `l${i}` }));
    expect(validateCartLines(lines, 20)).toBeNull();
  });
});
