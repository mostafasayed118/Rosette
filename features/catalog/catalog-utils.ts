import type { CatalogQuery, Product } from './types';

export function filterProducts(products: Product[], query: CatalogQuery): Product[] {
  const search = query.search?.trim().toLowerCase();
  return products.filter((product) => {
    if (search && !`${product.name} ${product.description}`.toLowerCase().includes(search)) return false;
    if (query.category && query.category !== 'all' && product.category !== query.category) return false;
    if (query.occasion && query.occasion !== 'all' && !product.occasions.includes(query.occasion)) return false;
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
  const sort = params.get('sort');
  if (search) query.search = search;
  if (category) query.category = category;
  if (occasion) query.occasion = occasion;
  if (sort === 'recommended' || sort === 'newest' || sort === 'price-asc' || sort === 'price-desc') query.sort = sort;
  return query;
}

export function serializeCatalogQuery(query: CatalogQuery): string {
  const params = new URLSearchParams();
  for (const key of ['search', 'category', 'occasion', 'sort'] as const) {
    const value = query[key];
    if (value) params.set(key, String(value));
  }
  return params.toString();
}
