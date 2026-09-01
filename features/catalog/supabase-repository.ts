import { getCity } from '@/features/destination/data';
import { applyDeliveryRule, fetchDeliveryRule, resolveDeliveryFee, DEFAULT_DELIVERY_FEE_MINOR } from '@/features/order/delivery-rules';
import { getServerSupabase } from '@/lib/supabase/server';
import { ratingBySlug, type ReviewRatingRow } from '@/features/reviews/aggregate';
import { PRODUCT_SELECT } from './product-select';
import { checkDeliveryDate } from '@/features/delivery/eligibility';
import type { CatalogRepository, CatalogQuery, DeliveryEligibilityInput, Product } from './types';
import { CATALOG_PER_PAGE } from './catalog-utils';
import { mapSupabaseProduct } from './row-mappers';

type ProductRow = Parameters<typeof mapSupabaseProduct>[0];

type CatalogQueryBuilder = {
  eq: (column: string, value: unknown) => CatalogQueryBuilder;
  gte: (column: string, value: unknown) => CatalogQueryBuilder;
  lte: (column: string, value: unknown) => CatalogQueryBuilder;
  contains: (column: string, value: unknown) => CatalogQueryBuilder;
  textSearch: (column: string, query: string, options?: { type?: 'plain' | 'phrase' | 'websearch'; config?: string }) => CatalogQueryBuilder;
  or: (filters: string) => CatalogQueryBuilder;
  order: (column: string, options?: { ascending?: boolean }) => CatalogQueryBuilder;
  range: (from: number, to: number) => Promise<{ data: unknown[] | null; error: { message: string } | null; count: number | null }>;
  maybeSingle: () => Promise<{ data: unknown | null; error: { message: string } | null }>;
};

const MAX_PAGE = 10_000;
const MAX_SEARCH_LENGTH = 80;

/**
 * PostgREST's `or()` expression is a small filter language. Restrict the
 * storefront search term to characters that can be meaningful in product names
 * before placing it into that expression; this both prevents filter injection
 * and bounds the amount of work a pathological query can request.
 */
function normalizeSearchTerm(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .trim()
    .slice(0, MAX_SEARCH_LENGTH)
    .replace(/\s+/g, ' ');
}

function escapeIlike(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_');
}

function safePage(page: number | undefined): number {
  if (!Number.isFinite(page)) return 1;
  return Math.min(Math.max(Math.trunc(page as number), 1), MAX_PAGE);
}

function applyCatalogFilters(query: CatalogQueryBuilder, filters: CatalogQuery, useFullTextSearch = false): CatalogQueryBuilder {
  if (filters.category && filters.category !== 'all') query.eq('category', filters.category);
  if (filters.occasion && filters.occasion !== 'all') query.contains('occasions', [filters.occasion]);
  if (filters.color && filters.color !== 'all') query.contains('gift_colors', [filters.color]);
  if (filters.minPrice !== undefined) query.gte('price_minor', filters.minPrice);
  if (filters.maxPrice !== undefined) query.lte('price_minor', filters.maxPrice);

  const search = filters.search ? normalizeSearchTerm(filters.search) : '';
  if (search && useFullTextSearch) {
    query.textSearch('search_vector', search, { type: 'websearch', config: 'simple' });
  } else if (search) {
    const term = `%${escapeIlike(search)}%`;
    query.or([
      `slug.ilike.${term}`,
      `name_en.ilike.${term}`,
      `name_ar.ilike.${term}`,
      `name_fr.ilike.${term}`,
      `description_en.ilike.${term}`,
      `description_ar.ilike.${term}`,
      `description_fr.ilike.${term}`,
    ].join(','));
  }
  return query;
}

function applySort(query: CatalogQueryBuilder, sort: CatalogQuery['sort']): CatalogQueryBuilder {
  if (sort === 'price-asc') return query.order('price_minor', { ascending: true });
  if (sort === 'price-desc') return query.order('price_minor', { ascending: false });
  if (sort === 'newest') return query.order('created_at', { ascending: false });
  // `recommended` intentionally has no order: preserve the database's curated
  // insertion order, matching the previous repository's no-sort behaviour.
  return query;
}

async function ratingsForSlugs(supabase: any, slugs: string[]): Promise<Map<string, { average: number; count: number }>> {
  if (slugs.length === 0) return new Map();
  const { data: reviewRows } = await supabase.from('product_reviews')
    .select('rating,status,products!inner(slug)')
    .eq('status', 'approved')
    .in('products.slug', slugs);
  return ratingBySlug(((reviewRows ?? []) as Array<{ rating: number; status: string; products?: { slug?: string } | null }>).map((row): ReviewRatingRow => ({
    product_slug: row.products?.slug ?? null,
    rating: row.rating,
    status: row.status,
  })));
}

function withRatings(products: Product[], ratings: Map<string, { average: number; count: number }>): Product[] {
  return products.map((product) => ({ ...product, rating: ratings.get(product.slug) ?? { average: 0, count: 0 } }));
}

export const supabaseCatalogRepository: CatalogRepository = {
  async list(query: CatalogQuery) {
    const supabase = await getServerSupabase();
    if (!supabase) return { products: [], total: 0, query, page: 1, perPage: CATALOG_PER_PAGE, totalPages: 1 };

    const requestedPage = safePage(query.page);
    let useFullTextSearch = Boolean(query.search);
    const buildQuery = () => applySort(applyCatalogFilters(
      supabase.from('products').select(PRODUCT_SELECT, { count: 'exact' }).eq('active', true) as unknown as CatalogQueryBuilder,
      query,
      useFullTextSearch,
    ), query.sort ?? 'recommended');
    let first = await buildQuery().range((requestedPage - 1) * CATALOG_PER_PAGE, requestedPage * CATALOG_PER_PAGE - 1);
    // Migration 042 adds the indexed tsvector. Until a live project has the
    // migration, fall back to the safe ILIKE branch instead of breaking search.
    if (first.error && useFullTextSearch) {
      useFullTextSearch = false;
      first = await buildQuery().range((requestedPage - 1) * CATALOG_PER_PAGE, requestedPage * CATALOG_PER_PAGE - 1);
    }
    if (first.error) throw new Error(`Catalog query failed: ${first.error.message}`);

    const total = first.count ?? 0;
    const totalPages = Math.max(1, Math.ceil(total / CATALOG_PER_PAGE));
    const page = Math.min(requestedPage, totalPages);
    const result = page === requestedPage
      ? first
      : await buildQuery().range((page - 1) * CATALOG_PER_PAGE, page * CATALOG_PER_PAGE - 1);
    if (result.error) throw new Error(`Catalog query failed: ${result.error.message}`);

    const products = ((result.data ?? []) as unknown as ProductRow[]).map(mapSupabaseProduct);
    const ratings = await ratingsForSlugs(supabase, products.map((product) => product.slug));
    return { products: withRatings(products, ratings), total, query, page, perPage: CATALOG_PER_PAGE, totalPages };
  },

  async getBySlug(slug) {
    const supabase = await getServerSupabase();
    if (!supabase) return null;
    const { data, error } = await supabase.from('products')
      .select(PRODUCT_SELECT)
      .eq('slug', slug)
      .eq('active', true)
      .maybeSingle();
    if (error) throw new Error(`Catalog query failed: ${error.message}`);
    if (!data) return null;
    const product = mapSupabaseProduct(data as unknown as ProductRow);
    const ratings = await ratingsForSlugs(supabase, [product.slug]);
    return withRatings([product], ratings)[0] ?? null;
  },

  async isDeliverable({ destination, date }: DeliveryEligibilityInput) {
    const city = getCity(destination.cityCode);
    if (!city) return { eligible: false, reason: 'That delivery city is not supported.', fee: 0 };
    // Shared with the PDP, checkout validation, and the orders route so all of
    // them reject exactly the same dates.
    const check = checkDeliveryDate(date);
    if (!check.eligible) {
      return {
        eligible: false,
        reason: check.reason === 'closed_weekday'
          ? 'Our studio rests on Fridays. Choose another day.'
          : 'Choose a valid delivery date.',
        fee: 0,
      };
    }
    const supabase = await getServerSupabase();
    const rule = supabase ? await fetchDeliveryRule(supabase, destination.cityCode) : null;
    const { feeMinor } = applyDeliveryRule(rule, 0, resolveDeliveryFee(destination.cityCode, 0) ?? DEFAULT_DELIVERY_FEE_MINOR);
    return { eligible: true, reason: city.sameDay ? 'Same-day delivery may be available before 2pm.' : 'Next-day delivery in this city.', fee: feeMinor };
  },
};
