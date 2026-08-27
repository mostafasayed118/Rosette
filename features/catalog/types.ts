import type { Destination } from '@/features/destination/types';

export type ProductVariant = { id: string; name: string; nameFr?: string; priceDelta: number };
export type AddOn = { id: string; name: string; nameFr?: string; price: number };
export type Product = { slug: string; name: string; nameAr?: string; nameFr?: string; description: string; descriptionAr?: string; descriptionFr?: string; category: string; occasions: string[]; giftRecipients?: string[]; giftStyles?: string[]; giftColors?: string[]; price: number; tone: string; imageUrl: string | null; inventory: number; delivery: string; createdAt: string; variants: ProductVariant[]; addOns: AddOn[]; rating?: { average: number; count: number } };
export type CatalogQuery = { search?: string; category?: string; occasion?: string; color?: string; minPrice?: number; maxPrice?: number; sort?: 'recommended' | 'newest' | 'price-asc' | 'price-desc'; page?: number };
export type CatalogPage = { products: Product[]; total: number; query: CatalogQuery; page: number; perPage: number; totalPages: number };
export type DeliveryEligibilityInput = { destination: Destination; date: string };
export type DeliveryEligibility = { eligible: boolean; reason: string; fee: number };
export interface CatalogRepository { list(query: CatalogQuery): Promise<CatalogPage>; getBySlug(slug: string): Promise<Product | null>; isDeliverable(input: DeliveryEligibilityInput): Promise<DeliveryEligibility>; }
