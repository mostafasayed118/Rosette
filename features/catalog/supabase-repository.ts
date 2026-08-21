import { getCity } from '@/features/destination/data';
import { applyDeliveryRule, fetchDeliveryRule } from '@/features/order/delivery-rules';
import { getServerSupabase } from '@/lib/supabase/server';
import { filterProducts, paginateProducts, sortProducts } from './catalog-utils';
import { mapSupabaseProduct } from './row-mappers';
import { ratingBySlug, type ReviewRatingRow } from '@/features/reviews/aggregate';
import type { CatalogRepository, CatalogQuery, DeliveryEligibilityInput } from './types';
import type { Product } from './types';

type ProductRow = Parameters<typeof mapSupabaseProduct>[0];

const productSelect = 'slug,name_en,name_ar,name_fr,description_en,description_ar,description_fr,category,occasions,price_minor,tone,image_url,delivery,created_at,add_ons,product_variants(id,name_en,name_ar,name_fr,price_delta_minor,inventory(quantity,reserved_quantity))';

async function readProducts(): Promise<Product[]> {
  const supabase = await getServerSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase.from('products').select(productSelect).eq('active', true);
  if (error) throw new Error(`Catalog query failed: ${error.message}`);
  const products = ((data ?? []) as unknown as ProductRow[]).map(mapSupabaseProduct);
  const { data: reviewRows } = await supabase.from('product_reviews')
    .select('rating,status,products(slug)')
    .eq('status', 'approved');
  const ratings = ratingBySlug(((reviewRows ?? []) as Array<{ rating: number; status: string; products?: { slug?: string } | null }>).map((row): ReviewRatingRow => ({
    product_slug: row.products?.slug ?? null,
    rating: row.rating,
    status: row.status,
  })));
  return products.map((product) => ({ ...product, rating: ratings.get(product.slug) ?? { average: 0, count: 0 } }));
}

export const supabaseCatalogRepository: CatalogRepository = {
  async list(query: CatalogQuery) {
    const filtered = sortProducts(filterProducts(await readProducts(), query), query.sort);
    const { items, page, perPage, totalPages, total } = paginateProducts(filtered, query.page);
    return { products: items, total, query, page, perPage, totalPages };
  },
  async getBySlug(slug) {
    const products = await readProducts();
    return products.find((product) => product.slug === slug) ?? null;
  },
  async isDeliverable({ destination, date }: DeliveryEligibilityInput) {
    const city = getCity(destination.cityCode);
    if (!city) return { eligible: false, reason: 'That delivery city is not supported.', fee: 0 };
    const selectedDate = new Date(`${date}T12:00:00`);
    if (Number.isNaN(selectedDate.getTime())) return { eligible: false, reason: 'Choose a valid delivery date.', fee: 0 };
    if (selectedDate.getDay() === 5) return { eligible: false, reason: 'Our studio rests on Fridays. Choose another day.', fee: 0 };
    const supabase = await getServerSupabase();
    const rule = supabase ? await fetchDeliveryRule(supabase, destination.cityCode) : null;
    const { feeMinor } = applyDeliveryRule(rule, 0, city.sameDay ? 1500 : 2500);
    return { eligible: true, reason: city.sameDay ? 'Same-day delivery may be available before 2pm.' : 'Next-day delivery in this city.', fee: feeMinor };
  },
};
