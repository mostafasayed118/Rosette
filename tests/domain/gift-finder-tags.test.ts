import { describe, expect, it } from 'vitest';
import { GIFT_RECIPIENTS, GIFT_STYLES, GIFT_COLORS, BUDGET_BANDS, answersToBudgetBand } from '@/features/gift-finder/tags';
import type { QuizAnswers } from '@/features/gift-finder/types';
import { products as localProducts } from '@/features/catalog/data';

describe('gift finder tags', () => {
  it('exposes the canonical recipient, style and color ids', () => {
    expect(GIFT_RECIPIENTS).toEqual(['partner', 'family', 'friend', 'colleague']);
    expect(GIFT_STYLES).toEqual(['romantic', 'classic', 'bold', 'minimal', 'playful']);
    expect(GIFT_COLORS).toEqual(['red', 'pink', 'white', 'pastel', 'bright', 'mixed']);
  });

  it('defines contiguous ascending budget bands', () => {
    for (let i = 0; i < BUDGET_BANDS.length - 1; i++) {
      const band = BUDGET_BANDS[i]!;
      const next = BUDGET_BANDS[i + 1]!;
      expect(band.maxMinor).toBeDefined();
      expect(next.minMinor).toBe(band.maxMinor);
      expect(next.minMinor).toBeGreaterThan(0);
    }
  });

  it('resolves an answers budget to its band', () => {
    const answers: QuizAnswers = { recipient: 'partner', occasion: 'love', budget: '150-250', color: 'red', style: 'romantic' };
    const band = answersToBudgetBand(answers);
    expect(band.id).toBe('150-250');
    expect(band.minMinor).toBe(15000);
    expect(band.maxMinor).toBe(25000);
  });
});

describe('local catalog gift tags', () => {
  it('uses only canonical tag ids', () => {
    for (const product of localProducts) {
      for (const recipient of product.giftRecipients ?? []) expect(GIFT_RECIPIENTS).toContain(recipient);
      for (const style of product.giftStyles ?? []) expect(GIFT_STYLES).toContain(style);
      for (const color of product.giftColors ?? []) expect(GIFT_COLORS).toContain(color);
    }
  });
});
