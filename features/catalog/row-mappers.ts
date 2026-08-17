import type { Product } from './types';

type SupabaseProductRow = {
  slug: string;
  name_en: string;
  name_ar: string;
  description_en: string;
  description_ar: string;
  category: string;
  occasions: string[];
  price_minor: number;
  tone: string;
  delivery: string;
  created_at: string;
  inventory?: Array<{ quantity: number; reserved_quantity: number }>;
  product_variants?: Array<{ id: string; name_en: string; name_ar: string; price_delta_minor: number }>;
  add_ons?: Array<{ id: string; name_en: string; name_ar?: string; price_minor: number }>;
};

export function mapSupabaseProduct(row: SupabaseProductRow): Product {
  const stock = row.inventory?.[0];
  return {
    slug: row.slug,
    name: row.name_en,
    nameAr: row.name_ar,
    description: row.description_en,
    descriptionAr: row.description_ar,
    category: row.category,
    occasions: row.occasions,
    price: row.price_minor,
    tone: row.tone,
    inventory: Math.max(0, (stock?.quantity ?? 0) - (stock?.reserved_quantity ?? 0)),
    delivery: row.delivery,
    createdAt: row.created_at,
    variants: (row.product_variants ?? []).map((variant) => ({ id: variant.id, name: variant.name_en, priceDelta: variant.price_delta_minor })),
    addOns: (row.add_ons ?? []).map((addOn) => ({ id: addOn.id, name: addOn.name_en, price: addOn.price_minor })),
  };
}
