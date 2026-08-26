import { describe, it, expect } from 'vitest';
import { scoreAffinity } from '@/features/personalization/scoring';
import type { Product } from '@/features/catalog/types';
const mk = (slug:string, category:string, occasions:string[], createdAt:string): Product => ({ slug, name: slug, description:'', category, occasions, price:1000, tone:'#fff', imageUrl:null, inventory:5, delivery:'next-day', createdAt, variants:[], addOns:[] });
describe('scoreAffinity', () => {
  it('buy_again outranks affinity', () => {
    const products = [mk('rose-hour','hand-bouquet',['birthday'],'2026-01-02'), mk('sunlit-stems','hand-bouquet',['birthday'],'2026-02-14'), mk('quiet-orchid','plants',['thank-you'],'2026-01-20')];
    const m = scoreAffinity(products, ['rose-hour','rose-hour'], [], {});
    expect(m.get('rose-hour')?.reason).toBe('buy_again');
    expect(m.get('sunlit-stems')?.reason).toBe('affinity');
    expect((m.get('sunlit-stems')?.score ?? 0)).toBeGreaterThan(m.get('quiet-orchid')?.score ?? 0);
  });
  it('excludes current slug', () => {
    const products = [mk('a','hand-bouquet',['love'],'2026-01-01'), mk('b','hand-bouquet',['love'],'2026-01-02')];
    const m = scoreAffinity(products, ['a'], [], { excludeSlug:'a' });
    expect(m.has('a')).toBe(false);
  });
});
