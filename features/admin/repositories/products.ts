import { getAdminClient, type AdminClient } from './client';

export type AdminProductRow = {
  id: string;
  slug: string;
  nameEn: string;
  nameAr: string;
  priceMinor: number;
  active: boolean;
  imageUrl: string | null;
};

export type AdminProductVariantRow = {
  id: string;
  nameEn: string;
  nameAr: string;
  priceDeltaMinor: number;
  active: boolean;
  quantity: number;
};

export type AdminProductAddOnRow = { id: string; nameEn: string; nameAr: string; priceMinor: number };

export type AdminProductDetail = {
  id: string;
  nameEn: string;
  nameAr: string;
  descriptionEn: string;
  descriptionAr: string;
  category: string;
  occasions: string[];
  giftRecipients: string[];
  giftStyles: string[];
  giftColors: string[];
  priceMinor: number;
  tone: string;
  imageUrl: string;
  delivery: string;
  active: boolean;
  variants: AdminProductVariantRow[];
  addOns: AdminProductAddOnRow[];
};

const LIST_SELECT = 'id,slug,name_en,name_ar,price_minor,active,image_url';
const DETAIL_SELECT = '*,product_variants(*,inventory(quantity,reserved_quantity))';

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((entry) => String(entry)) : [];
}

function str(value: unknown): string {
  return value == null ? '' : String(value);
}

function num(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function listAdminProducts(client: AdminClient = getAdminClient()): Promise<AdminProductRow[]> {
  const { data } = await client.from('products').select(LIST_SELECT).order('created_at', { ascending: false });
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: str(row.id),
    slug: str(row.slug),
    nameEn: str(row.name_en),
    nameAr: str(row.name_ar),
    priceMinor: num(row.price_minor),
    active: Boolean(row.active),
    imageUrl: row.image_url == null ? null : str(row.image_url),
  }));
}

export async function getAdminProduct(
  productId: string,
  client: AdminClient = getAdminClient(),
): Promise<AdminProductDetail | null> {
  const { data } = await client.from('products').select(DETAIL_SELECT).eq('id', productId).maybeSingle();
  if (!data) return null;
  const row = data as Record<string, unknown>;
  const variants = Array.isArray(row.product_variants) ? (row.product_variants as Array<Record<string, unknown>>) : [];
  const addOns = Array.isArray(row.add_ons) ? (row.add_ons as Array<Record<string, unknown>>) : [];
  return {
    id: str(row.id),
    nameEn: str(row.name_en),
    nameAr: str(row.name_ar),
    descriptionEn: str(row.description_en),
    descriptionAr: str(row.description_ar),
    category: str(row.category),
    occasions: asStringArray(row.occasions),
    giftRecipients: asStringArray(row.gift_recipients),
    giftStyles: asStringArray(row.gift_styles),
    giftColors: asStringArray(row.gift_colors),
    priceMinor: num(row.price_minor),
    tone: str(row.tone),
    imageUrl: str(row.image_url),
    delivery: str(row.delivery),
    active: Boolean(row.active),
    variants: variants.map((variant) => {
      const inventory = Array.isArray(variant.inventory) ? (variant.inventory as Array<Record<string, unknown>>) : [];
      return {
        id: str(variant.id),
        nameEn: str(variant.name_en),
        nameAr: str(variant.name_ar),
        priceDeltaMinor: num(variant.price_delta_minor),
        active: Boolean(variant.active),
        quantity: num(inventory[0]?.quantity),
      };
    }),
    addOns: addOns.map((addOn) => ({
      id: str(addOn.id),
      nameEn: str(addOn.name_en),
      nameAr: str(addOn.name_ar),
      priceMinor: num(addOn.price_minor),
    })),
  };
}
