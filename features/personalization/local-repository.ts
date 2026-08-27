import type { PersonalizationRepository, PersonalizationPicks } from './types';
import { scoreAffinity } from './scoring';
import type { Product } from '@/features/catalog/types';
export function createLocalPersonalizationRepository(deps: { products: Product[]; orderSlugsFor: (id: string) => Promise<string[]>; wishlistFor: (id: string) => Promise<string[]> }): PersonalizationRepository {
  return {
    async getPicks(customerId, query) {
      const limit = Math.min(Math.max(query.limit ?? 8, 1), 12);
      const orderSlugs = await deps.orderSlugsFor(customerId);
      const wishlist = await deps.wishlistFor(customerId);
      const m = scoreAffinity(deps.products, orderSlugs, wishlist, { excludeSlug: query.excludeSlug });
      const ordered = [...deps.products].filter((p) => m.has(p.slug)).sort((a, b) => m.get(b.slug)!.score - m.get(a.slug)!.score);
      const buyAgain = ordered.filter((p) => m.get(p.slug)!.reason === 'buy_again').slice(0, Math.ceil(limit / 2));
      let recommended = ordered.filter((p) => m.get(p.slug)!.reason === 'affinity');
      const fallbackFromScored = ordered.filter((p) => m.get(p.slug)!.reason === 'fallback_newest');
      if (recommended.length < limit - buyAgain.length && fallbackFromScored.length) {
        const need = limit - buyAgain.length - recommended.length;
        recommended = [...recommended, ...fallbackFromScored.slice(0, need)];
      }
      if (recommended.length < limit - buyAgain.length) {
        const fallback = [...deps.products]
          .filter((p) => !m.has(p.slug) && p.slug !== query.excludeSlug)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .slice(0, limit - buyAgain.length - recommended.length);
        for (const p of fallback) m.set(p.slug, { score: 0, reason: 'fallback_newest' });
        recommended = [...recommended, ...fallback];
      }
      const reason: PersonalizationPicks['reason'] = orderSlugs.length === 0 && wishlist.length === 0 ? 'fallback' : 'history';
      const hintProduct = buyAgain[0] ?? recommended[0];
      const picks: PersonalizationPicks = {
        buyAgain: buyAgain.slice(0, limit),
        recommended: recommended.slice(0, limit - buyAgain.length),
        reason,
      };
      if (hintProduct?.category) picks.hintCategory = hintProduct.category;
      return picks;
    },
  };
}
