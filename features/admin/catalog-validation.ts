import { z } from 'zod';
import { GIFT_RECIPIENTS, GIFT_STYLES, GIFT_COLORS } from '@/features/gift-finder/tags';

export const CATEGORIES = ['hand-bouquet', 'vase-arrangement', 'plants', 'gift-boxes', 'sympathy'];
export const OCCASIONS = ['birthday', 'love', 'thank-you', 'new-home', 'congratulations', 'sympathy'];
const TONE_PATTERN = /^#[0-9a-f]{6}$/i;
const IMAGE_URL_PATTERN = /^https?:\/\/.+/;

export type SaveProductInput = {
  nameEn: string; nameAr: string; descriptionEn: string; descriptionAr: string;
  category: string; occasions: string[]; giftRecipients: string[]; giftStyles: string[]; giftColors: string[]; priceMinor: number; tone: string; imageUrl: string; delivery: string; active: boolean;
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
  if (!(input.giftRecipients ?? []).every((r) => (GIFT_RECIPIENTS as readonly string[]).includes(r))) return 'invalid_gift_recipients';
  if (!(input.giftStyles ?? []).every((s) => (GIFT_STYLES as readonly string[]).includes(s))) return 'invalid_gift_styles';
  if (!(input.giftColors ?? []).every((c) => (GIFT_COLORS as readonly string[]).includes(c))) return 'invalid_gift_colors';
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

const categorySchema = z.enum(CATEGORIES as [string, ...string[]]);
const occasionSchema = z.enum(OCCASIONS as [string, ...string[]]);
const frequencySchema = z.enum(['weekly', 'biweekly', 'monthly']);
const promoTypeSchema = z.enum(['percent', 'fixed', 'free_shipping']);
const planSlugSchema = z.string().regex(/^[a-z0-9-]+$/);

/** Route-level guard for the admin product create payload (mirrors `validateProductInput`). */
export const productPayloadSchema = z.object({
  nameEn: z.string().min(1),
  nameAr: z.string().min(1),
  descriptionEn: z.string(),
  descriptionAr: z.string(),
  category: categorySchema,
  occasions: z.array(occasionSchema),
  giftRecipients: z.array(z.string()),
  giftStyles: z.array(z.string()),
  giftColors: z.array(z.string()),
  priceMinor: z.number().int().min(0),
  tone: z.string().regex(TONE_PATTERN),
  imageUrl: z.string().default('').refine((v) => v === '' || IMAGE_URL_PATTERN.test(v), 'invalid_image_url'),
  delivery: z.string().min(1),
  active: z.boolean(),
  variants: z
    .array(
      z.object({
        id: z.string().optional(),
        nameEn: z.string().min(1),
        nameAr: z.string().min(1),
        priceDeltaMinor: z.number().int(),
        active: z.boolean(),
        quantity: z.number().int().min(0),
      }),
    )
    .min(1),
  addOns: z.array(
    z.object({
      id: z.string().min(1),
      nameEn: z.string().min(1),
      nameAr: z.string().min(1),
      priceMinor: z.number().int().min(0),
    }),
  ),
});

/** Route-level guard for the admin promo create/update payload (mirrors `validatePromoInput`). */
export const promoPayloadSchema = z.object({
  code: z
    .string()
    .transform((v) => v.trim().toUpperCase())
    .pipe(z.string().regex(/^[A-Z0-9][A-Z0-9-]*$/)),
  type: promoTypeSchema,
  percentOff: z.number().int().nullable(),
  valueMinor: z.number().int().nullable(),
  minimumOrderMinor: z.number().int().min(0),
  startsAt: z.string().nullable().default(null),
  expiresAt: z.string().nullable().default(null),
  maxUses: z.number().int().min(0),
  perUserLimit: z.number().int().min(0),
  active: z.boolean(),
});

/** Route-level guard for the admin subscription plan create payload. */
export const planPayloadSchema = z.object({
  slug: planSlugSchema,
  nameEn: z.string().min(1),
  nameAr: z.string().min(1),
  nameFr: z.string().min(1),
  descriptionEn: z.string().default(''),
  descriptionAr: z.string().default(''),
  descriptionFr: z.string().default(''),
  productId: z.string().uuid().nullable().optional(),
  frequencies: z.array(frequencySchema).min(1),
  bundlePrices: z
    .array(
      z.object({
        deliveries: z.number().int().min(1),
        priceMinor: z.number().int().min(1),
      }),
    )
    .min(1),
  active: z.boolean().default(true),
  sortOrder: z.number().int().min(0).default(0),
});