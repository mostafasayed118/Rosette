export type PriceWatchProduct = {
  priceMinor: number;
  variants: Array<{ priceDeltaMinor: number; active: boolean; inventory?: Array<{ quantity: number; reserved_quantity: number }> }>;
};

export type PriceWatchInput = { product: PriceWatchProduct; lastPriceMinor: number; lastAvailableStock: number };

export type PriceWatchResult =
  | { type: 'none' }
  | { type: 'price_drop'; oldMinor: number; newMinor: number }
  | { type: 'back_in_stock' }
  | { type: 'price_drop_and_back_in_stock'; oldMinor: number; newMinor: number };

export function currentPriceMinor(product: PriceWatchProduct): number {
  const active = product.variants.filter((variant) => variant.active);
  if (active.length === 0) return product.priceMinor;
  return Math.min(...active.map((variant) => product.priceMinor + variant.priceDeltaMinor));
}

export function currentAvailableStock(product: PriceWatchProduct): number {
  return product.variants.filter((variant) => variant.active).reduce((sum, variant) => {
    const inventory = variant.inventory?.[0];
    return sum + Math.max(0, (inventory?.quantity ?? 0) - (inventory?.reserved_quantity ?? 0));
  }, 0);
}

export function evaluateWishlistWatch(input: PriceWatchInput): PriceWatchResult {
  const price = currentPriceMinor(input.product);
  const stock = currentAvailableStock(input.product);
  const dropped = price < input.lastPriceMinor;
  const restocked = input.lastAvailableStock === 0 && stock > 0;
  if (dropped && restocked) return { type: 'price_drop_and_back_in_stock', oldMinor: input.lastPriceMinor, newMinor: price };
  if (dropped) return { type: 'price_drop', oldMinor: input.lastPriceMinor, newMinor: price };
  if (restocked) return { type: 'back_in_stock' };
  return { type: 'none' };
}
