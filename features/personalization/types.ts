import type { Product } from '@/features/catalog/types';
import { z } from 'zod';

export type PersonalizationReason = 'buy_again' | 'affinity' | 'fallback_newest';
export type PersonalizationPicks = { buyAgain: Product[]; recommended: Product[]; reason: 'history' | 'fallback' };
export type PersonalizationQuery = { limit?: number; excludeSlug?: string; locale?: 'en' | 'ar' | 'fr' };
export interface PersonalizationRepository {
  getPicks(customerId: string, query: PersonalizationQuery): Promise<PersonalizationPicks>;
}

export const personalizationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(12).default(8),
  excludeSlug: z.string().max(80).optional(),
  locale: z.enum(['en', 'ar', 'fr']).default('en'),
});

export const wishlistSyncSchema = z.array(z.string().max(80)).max(50);
