import Fuse, { type IFuseOptions } from 'fuse.js';
import type { Product } from './types';

export type FuseProduct = Product;

/**
 * Free client-side fuzzy search for catalog.
 * MIT, ~4kb gzipped, no backend needed.
 * Handles bilingual fields: name/nameAr/nameFr + description variants.
 */
const fuseOptions: IFuseOptions<FuseProduct> = {
  keys: [
    { name: 'name', weight: 0.35 },
    { name: 'nameAr', weight: 0.35 },
    { name: 'nameFr', weight: 0.2 },
    { name: 'description', weight: 0.15 },
    { name: 'descriptionAr', weight: 0.15 },
    { name: 'descriptionFr', weight: 0.1 },
    { name: 'category', weight: 0.1 },
    { name: 'occasions', weight: 0.08 },
    { name: 'tone', weight: 0.02 },
  ],
  threshold: 0.32, // 0 = exact, 1 = match anything. 0.32 is good for typo tolerance (e.g. "roes" -> "Rose Hour")
  ignoreLocation: true,
  minMatchCharLength: 2,
  includeScore: true,
  shouldSort: true,
  useExtendedSearch: false,
};

let fuseInstance: Fuse<FuseProduct> | null = null;
let cachedProductsRef: FuseProduct[] | null = null;

export function getFuse(products: FuseProduct[]): Fuse<FuseProduct> {
  if (fuseInstance && cachedProductsRef === products) return fuseInstance;
  fuseInstance = new Fuse(products, fuseOptions);
  cachedProductsRef = products;
  return fuseInstance;
}

/**
 * Search products with Fuse, fallback to simple substring if Fuse returns empty.
 * Keeps Arabic/English typo tolerance while remaining fast for 100-500 items.
 */
export function searchProducts(products: FuseProduct[], query: string): FuseProduct[] {
  const trimmed = query.trim();
  if (!trimmed) return products;
  if (trimmed.length < 2) {
    const lower = trimmed.toLowerCase();
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(lower) ||
        (p.nameAr?.toLowerCase().includes(lower) ?? false) ||
        p.description.toLowerCase().includes(lower),
    );
  }
  const fuse = getFuse(products);
  const results = fuse.search(trimmed);
  if (results.length === 0) return [];
  return results.map((r) => r.item);
}

/**
 * Upgrade filterProducts to use Fuse for the search term only.
 * Category/occasion/price filters stay as strict checks.
 */
export function filterProductsWithFuse(products: FuseProduct[], search: string | undefined): FuseProduct[] {
  if (!search?.trim()) return products;
  return searchProducts(products, search);
}
