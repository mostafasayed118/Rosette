import type { Destination } from '@/features/destination/types';

export type ProductVariant = { id: string; name: string; nameFr?: string; priceDelta: number };
export type AddOn = { id: string; name: string; nameFr?: string; price: number };
export type Product = { slug: string; name: string; nameAr?: string; nameFr?: string; description: string; descriptionAr?: string; descriptionFr?: string; category: string; occasions: string[]; price: number; tone: string; imageUrl: string | null; inventory: number; delivery: string; createdAt: string; variants: ProductVariant[]; addOns: AddOn[] };
export type CatalogQuery = { search?: string; category?: string; occasion?: string; color?: string; minPrice?: number; maxPrice?: number; sort?: 'recommended' | 'newest' | 'price-asc' | 'price-desc' };
export type CatalogPage = { products: Product[]; total: number; query: CatalogQuery };
export type DeliveryEligibilityInput = { destination: Destination; date: string };
export type DeliveryEligibility = { eligible: boolean; reason: string; fee: number };
export interface CatalogRepository { list(query: CatalogQuery): Promise<CatalogPage>; getBySlug(slug: string): Promise<Product | null>; isDeliverable(input: DeliveryEligibilityInput): Promise<DeliveryEligibility>; }
