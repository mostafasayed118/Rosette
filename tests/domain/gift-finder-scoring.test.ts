import { describe, expect, it } from 'vitest';
import type { Product } from '@/features/catalog/types';
import { scoreProducts, buildReasons } from '@/features/gift-finder/scoring';
import type { QuizAnswers } from '@/features/gift-finder/types';

const base: Product = {
  slug: 'p', name: 'P', description: '', category: 'hand-bouquet', occasions: [],
  price: 12000, tone: '#000000', imageUrl: null, inventory: 5, delivery: 'Next-day', createdAt: '2026-01-01', variants: [], addOns: [],
};

const mk = (over: Partial<Product>): Product => ({ ...base, ...over });

const redRose = mk({ slug: 'red-rose', occasions: ['love'], price: 14000, giftRecipients: ['partner'], giftStyles: ['romantic'], giftColors: ['red'], rating: { average: 4.5, count: 10 } });
const pinkTulip = mk({ slug: 'pink-tulip', occasions: ['birthday'], price: 14000, giftRecipients: ['friend'], giftStyles: ['playful'], giftColors: ['pink'], rating: { average: 5, count: 2 } });
const overBudget = mk({ slug: 'over-budget', occasions: ['love'], price: 30000, giftRecipients: ['partner'], giftStyles: ['romantic'], giftColors: ['red'] });
const soldOut = mk({ slug: 'sold-out', occasions: ['love'], price: 14000, giftRecipients: ['partner'], giftStyles: ['romantic'], giftColors: ['red'], inventory: 0 });
const untagged = mk({ slug: 'untagged', occasions: ['love'], price: 14000 });

const answers: QuizAnswers = { recipient: 'partner', occasion: 'love', budget: '150-250', color: 'red', style: 'romantic' };

describe('buildReasons', () => {
  it('reports which answers a product satisfies', () => {
    expect(buildReasons(redRose, answers).sort()).toEqual(['color', 'occasion', 'recipient', 'style']);
  });
  it('skips the occasion when the answer is just-because', () => {
    const jb = { ...answers, occasion: 'just-because' } as QuizAnswers;
    expect(buildReasons(untagged, jb)).not.toContain('occasion');
    expect(buildReasons(redRose, jb)).toContain('color');
  });
});

describe('scoreProducts', () => {
  it('hard-filters out-of-budget and out-of-stock products', () => {
    const result = scoreProducts([redRose, pinkTulip, overBudget, soldOut], answers, { minResults: 1 });
    expect(result.map((r) => r.product.slug)).not.toContain('over-budget');
    expect(result.map((r) => r.product.slug)).not.toContain('sold-out');
  });

  it('ranks by weighted score then rating then recency', () => {
    // minResults 1 isolates the first ladder rung that yields a non-empty pool;
    // redRose (4 answer matches, score 10) outranks pinkTulip (0 matches).
    const result = scoreProducts([pinkTulip, redRose], answers, { minResults: 1 });
    expect(result[0]?.product.slug).toBe('red-rose');
  });

  it('applies the fallback ladder when too few results match', () => {
    // only redRose matches color/style; the ladder drops style then color so
    // pinkTulip's band-qualified pool reaches the minimum of 2.
    const result = scoreProducts([redRose, pinkTulip], answers, { minResults: 2 });
    expect(result.length).toBe(2);
    expect(result.map((r) => r.product.slug)).toContain('red-rose');
  });

  it('degrades gracefully for untagged products by occasion and band', () => {
    const result = scoreProducts([redRose, untagged], answers, { minResults: 2 });
    expect(result.some((r) => r.product.slug === 'untagged')).toBe(true);
  });

  it('returns empty when nothing qualifies after the ladder', () => {
    const far = mk({ slug: 'far', occasions: ['sympathy'], price: 3000, giftRecipients: [], giftStyles: [], giftColors: [] });
    expect(scoreProducts([far], answers)).toEqual([]);
  });
});
