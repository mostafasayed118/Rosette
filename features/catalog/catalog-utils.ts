import type { CatalogQuery, Product } from './types';
import { searchProducts } from './fuse-search';

/** Products per catalog page — tuned to the two-column masonry rhythm. */
export const CATALOG_PER_PAGE = 8;

export type PaginatedProducts = { items: Product[]; page: number; perPage: number; totalPages: number; total: number };

/**
 * Slice an already filtered/sorted list into a single page.
 * Pages are clamped into range so a stale `?page=` never renders an empty grid.
 */
export function paginateProducts(products: Product[], page: number | undefined, perPage: number = CATALOG_PER_PAGE): PaginatedProducts {
  const total = products.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const requested = Number.isFinite(page) ? Math.trunc(page as number) : 1;
  const current = Math.min(Math.max(requested || 1, 1), totalPages);
  const start = (current - 1) * perPage;
  return { items: products.slice(start, start + perPage), page: current, perPage, totalPages, total };
}

export function filterProducts(products: Product[], query: CatalogQuery): Product[] {
  const trimmedSearch = query.search?.trim();
  // Use Fuse.js for typo-tolerant, bilingual search (free, ~4kb). Fallback to exact if no Fuse match.
  let candidates = products;
  if (trimmedSearch) {
    const fuseResults = searchProducts(products, trimmedSearch);
    // If Fuse found matches, use them; if empty and query is <2 chars, do substring fallback inside searchProducts.
    // To keep behavior deterministic for tests, only replace candidates when Fuse returns non-empty or search is non-empty.
    candidates = fuseResults.length > 0 || trimmedSearch.length >= 2 ? fuseResults : [];
    // If Fuse returned empty for a 2+ char query, keep empty (means no fuzzy match) — do NOT fall back to full list.
    if (fuseResults.length === 0 && trimmedSearch.length >= 2) return [];
  }
  return candidates.filter((product) => {
    if (query.category && query.category !== 'all' && product.category !== query.category) return false;
    if (query.occasion && query.occasion !== 'all' && !product.occasions.includes(query.occasion)) return false;
    if (query.color && query.color !== 'all' && !(product.giftColors ?? []).includes(query.color)) return false;
    if (query.minPrice !== undefined && product.price < query.minPrice) return false;
    if (query.maxPrice !== undefined && product.price > query.maxPrice) return false;
    return true;
  });
}

export function sortProducts(products: Product[], sort: CatalogQuery['sort'] = 'recommended'): Product[] {
  return [...products].sort((a, b) => {
    if (sort === 'price-asc') return a.price - b.price;
    if (sort === 'price-desc') return b.price - a.price;
    if (sort === 'newest') return b.createdAt.localeCompare(a.createdAt);
    return 0;
  });
}

export function parseCatalogQuery(params: URLSearchParams): CatalogQuery {
  const query: CatalogQuery = {};
  const search = params.get('search');
  const category = params.get('category');
  const occasion = params.get('occasion');
  const color = params.get('color');
  const sort = params.get('sort');
  const page = Number(params.get('page'));
  if (search) query.search = search;
  if (category) query.category = category;
  if (occasion) query.occasion = occasion;
  if (color) query.color = color;
  if (sort === 'recommended' || sort === 'newest' || sort === 'price-asc' || sort === 'price-desc') query.sort = sort;
  if (Number.isInteger(page) && page > 1) query.page = page;
  return query;
}

export function serializeCatalogQuery(query: CatalogQuery): string {
  const params = new URLSearchParams();
  for (const key of ['search', 'category', 'occasion', 'color', 'sort'] as const) {
    const value = query[key];
    if (value) params.set(key, String(value));
  }
  // Page 1 is the default, so keep it out of the URL for clean canonical links.
  if (query.page && query.page > 1) params.set('page', String(query.page));
  return params.toString();
}
