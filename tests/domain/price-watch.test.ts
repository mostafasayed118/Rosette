import { describe, expect, it } from 'vitest';
import { currentAvailableStock, currentPriceMinor, evaluateWishlistWatch } from '@/features/wishlist/price-watch';

const base = (overrides: Record<string, unknown> = {}): Parameters<typeof currentPriceMinor>[0] => ({
  priceMinor: 10000,
  variants: [],
  ...overrides,
});

describe('currentPriceMinor', () => {
  it('returns the base price when there are no variants', () => {
    expect(currentPriceMinor(base())).toBe(10000);
  });

  it('returns the lowest active variant total', () => {
    const product = base({ variants: [{ priceDeltaMinor: 0, active: true }, { priceDeltaMinor: 2000, active: true }] });
    expect(currentPriceMinor(product)).toBe(10000);
  });

  it('skips inactive variants', () => {
    const product = base({ variants: [{ priceDeltaMinor: -3000, active: false }, { priceDeltaMinor: 0, active: true }] });
    expect(currentPriceMinor(product)).toBe(10000);
  });

  it('falls back to the base price when all variants are inactive', () => {
    const product = base({ variants: [{ priceDeltaMinor: -5000, active: false }] });
    expect(currentPriceMinor(product)).toBe(10000);
  });
});

describe('currentAvailableStock', () => {
  it('sums quantity minus reserved over active variants', () => {
    const product = base({ variants: [
      { priceDeltaMinor: 0, active: true, inventory: [{ quantity: 5, reserved_quantity: 2 }] },
      { priceDeltaMinor: 0, active: true, inventory: [{ quantity: 3, reserved_quantity: 0 }] },
    ] });
    expect(currentAvailableStock(product)).toBe(6);
  });

  it('skips inactive variants', () => {
    const product = base({ variants: [
      { priceDeltaMinor: 0, active: true, inventory: [{ quantity: 5, reserved_quantity: 0 }] },
      { priceDeltaMinor: 0, active: false, inventory: [{ quantity: 9, reserved_quantity: 0 }] },
    ] });
    expect(currentAvailableStock(product)).toBe(5);
  });

  it('returns 0 when there are no active variants or inventory', () => {
    expect(currentAvailableStock(base())).toBe(0);
    expect(currentAvailableStock(base({ variants: [{ priceDeltaMinor: 0, active: true }] }))).toBe(0);
  });
});

describe('evaluateWishlistWatch', () => {
  it('returns none on the first run (snapshots are the -1 sentinel, even when the product is in stock)', () => {
    const product = base({ variants: [{ priceDeltaMinor: 0, active: true, inventory: [{ quantity: 3, reserved_quantity: 0 }] }] });
    expect(evaluateWishlistWatch({ product, lastPriceMinor: -1, lastAvailableStock: -1 })).toEqual({ type: 'none' });
  });

  it('returns none when price and stock are unchanged', () => {
    const product = base({ variants: [{ priceDeltaMinor: 0, active: true, inventory: [{ quantity: 3, reserved_quantity: 0 }] }] });
    expect(evaluateWishlistWatch({ product, lastPriceMinor: 10000, lastAvailableStock: 3 })).toEqual({ type: 'none' });
  });

  it('fires price_drop when the lowest price falls below the snapshot', () => {
    const product = base({ priceMinor: 8000, variants: [{ priceDeltaMinor: 0, active: true }] });
    expect(evaluateWishlistWatch({ product, lastPriceMinor: 10000, lastAvailableStock: 3 })).toEqual({ type: 'price_drop', oldMinor: 10000, newMinor: 8000 });
  });

  it('fires back_in_stock only when stock went from zero to positive', () => {
    const product = base({ variants: [{ priceDeltaMinor: 0, active: true, inventory: [{ quantity: 2, reserved_quantity: 0 }] }] });
    expect(evaluateWishlistWatch({ product, lastPriceMinor: 10000, lastAvailableStock: 0 })).toEqual({ type: 'back_in_stock' });
    expect(evaluateWishlistWatch({ product, lastPriceMinor: 10000, lastAvailableStock: 2 })).toEqual({ type: 'none' });
  });

  it('fires both when the price dropped and stock restocked', () => {
    const product = base({ priceMinor: 8000, variants: [{ priceDeltaMinor: 0, active: true, inventory: [{ quantity: 2, reserved_quantity: 0 }] }] });
    expect(evaluateWishlistWatch({ product, lastPriceMinor: 10000, lastAvailableStock: 0 })).toEqual({ type: 'price_drop_and_back_in_stock', oldMinor: 10000, newMinor: 8000 });
  });
});
