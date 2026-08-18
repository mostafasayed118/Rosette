import { getCity } from '@/features/destination/data';
import { applyDeliveryRule, fetchDeliveryRule } from '@/features/order/delivery-rules';
import { getServerSupabase } from '@/lib/supabase/server';
import { filterProducts, sortProducts } from './catalog-utils';
import { mapSupabaseProduct } from './row-mappers';
import type { CatalogRepository, CatalogQuery, DeliveryEligibilityInput } from './types';
import type { Product } from './types';

type ProductRow = Parameters<typeof mapSupabaseProduct>[0];

const productSelect = 'slug,name_en,name_ar,name_fr,description_en,description_ar,description_fr,category,occasions,price_minor,tone,delivery,created_at,add_ons,product_variants(id,name_en,name_ar,name_fr,price_delta_minor,inventory(quantity,reserved_quantity))';

async function readProducts(): Promise<Product[]> {
  const supabase = await getServerSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase.from('products').select(productSelect).eq('active', true);
  if (error) throw new Error(`Catalog query failed: ${error.message}`);
  return ((data ?? []) as unknown as ProductRow[]).map(mapSupabaseProduct);
}

export const supabaseCatalogRepository: CatalogRepository = {
  async list(query: CatalogQuery) {
    const filtered = sortProducts(filterProducts(await readProducts(), query), query.sort);
    return { products: filtered, total: filtered.length, query };
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
