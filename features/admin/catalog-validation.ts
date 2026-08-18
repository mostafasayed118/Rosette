export const CATEGORIES = ['hand-bouquet', 'vase-arrangement', 'plants', 'gift-boxes', 'sympathy'];
export const OCCASIONS = ['birthday', 'love', 'thank-you', 'new-home', 'congratulations', 'sympathy'];
const TONE_PATTERN = /^#[0-9a-f]{6}$/i;
const IMAGE_URL_PATTERN = /^https?:\/\/.+/;

export type SaveProductInput = {
  nameEn: string; nameAr: string; descriptionEn: string; descriptionAr: string;
  category: string; occasions: string[]; priceMinor: number; tone: string; imageUrl: string; delivery: string; active: boolean;
  variants: Array<{ id?: string; nameEn: string; nameAr: string; priceDeltaMinor: number; active: boolean; quantity: number }>;
  addOns: Array<{ id: string; nameEn: string; nameAr: string; priceMinor: number }>;
};

export function slugify(input: string): string {
  return input.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export function validateProductInput(input: SaveProductInput): string | null {
  if (!input.nameEn.trim() || !input.nameAr.trim()) return 'names_required';
  if (!slugify(input.nameEn)) return 'slug_required';
  if (!CATEGORIES.includes(input.category)) return 'invalid_category';
  if (!input.occasions.every((occasion) => OCCASIONS.includes(occasion))) return 'invalid_occasion';
  if (!Number.isInteger(input.priceMinor) || input.priceMinor < 0) return 'invalid_price';
  if (!TONE_PATTERN.test(input.tone)) return 'invalid_tone';
  if (input.imageUrl && !IMAGE_URL_PATTERN.test(input.imageUrl)) return 'invalid_image_url';
  if (!input.delivery.trim()) return 'invalid_delivery';
  if (!input.variants.length) return 'variants_required';
  for (const variant of input.variants) {
    if (!variant.nameEn.trim()) return 'variant_name_required';
    if (!Number.isInteger(variant.priceDeltaMinor)) return 'invalid_variant_price';
    if (!Number.isInteger(variant.quantity) || variant.quantity < 0) return 'invalid_quantity';
  }
  for (const addOn of input.addOns) {
    if (!addOn.id.trim() || !addOn.nameEn.trim()) return 'addon_required';
    if (!Number.isInteger(addOn.priceMinor) || addOn.priceMinor < 0) return 'invalid_addon_price';
  }
  return null;
}