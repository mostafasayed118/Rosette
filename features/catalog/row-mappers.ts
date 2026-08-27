import type { Product } from './types';

type SupabaseProductRow = {
  slug: string;
  name_en: string;
  name_ar: string;
  name_fr?: string;
  description_en: string;
  description_ar: string;
  description_fr?: string;
  category: string;
  occasions: string[];
  gift_recipients?: string[];
  gift_styles?: string[];
  gift_colors?: string[];
  price_minor: number;
  tone: string;
  image_url?: string | null;
  delivery: string;
  created_at: string;
  add_ons?: Array<{ id: string; name_en: string; name_ar?: string; name_fr?: string; price_minor: number }>;
  product_variants?: Array<{
    id: string;
    name_en: string;
    name_ar: string;
    name_fr?: string;
    price_delta_minor: number;
    // PostgREST returns the one-to-one inventory embed as an object (the FK is
    // the primary key) — not an array — so accept both shapes.
    inventory?: { quantity: number; reserved_quantity: number } | Array<{ quantity: number; reserved_quantity: number }>;
  }>;
};

function variantStock(variant: { inventory?: { quantity: number; reserved_quantity: number } | Array<{ quantity: number; reserved_quantity: number }> }): { quantity: number; reserved_quantity: number } | undefined {
  return Array.isArray(variant.inventory) ? variant.inventory[0] : variant.inventory;
}

export function mapSupabaseProduct(row: SupabaseProductRow): Product {
  // Inventory lives per-variant; the storefront model is product-level, so sum
  // the available stock (quantity - reserved) across all variants.
  const available = (row.product_variants ?? []).reduce((sum, variant) => {
    const stock = variantStock(variant);
    return sum + Math.max(0, (stock?.quantity ?? 0) - (stock?.reserved_quantity ?? 0));
  }, 0);
  return {
    slug: row.slug,
    name: row.name_en,
    nameAr: row.name_ar,
    nameFr: row.name_fr,
    description: row.description_en,
    descriptionAr: row.description_ar,
    descriptionFr: row.description_fr,
    category: row.category,
    occasions: row.occasions,
    giftRecipients: row.gift_recipients ?? [],
    giftStyles: row.gift_styles ?? [],
    giftColors: row.gift_colors ?? [],
    price: row.price_minor,
    tone: row.tone,
    imageUrl: row.image_url ?? null,
    inventory: available,
    delivery: row.delivery,
    createdAt: row.created_at,
    variants: (row.product_variants ?? []).map((variant) => ({ id: variant.id, name: variant.name_en, nameFr: variant.name_fr, priceDelta: variant.price_delta_minor })),
    addOns: (row.add_ons ?? []).map((addOn) => ({ id: addOn.id, name: addOn.name_en, nameFr: addOn.name_fr, price: addOn.price_minor })),
  };
}

export const mapRowToProduct = mapSupabaseProduct;
