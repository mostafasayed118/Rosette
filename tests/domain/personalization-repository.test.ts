import { describe,it,expect,vi } from 'vitest';
import { createLocalPersonalizationRepository } from '@/features/personalization/local-repository';
import { products } from '@/features/catalog/data';
describe('local repo',()=>{
  it('pads with newest when no history', async()=>{
    const repo = createLocalPersonalizationRepository({ products, orderSlugsFor: async()=>[], wishlistFor: async()=>[] });
    const picks = await repo.getPicks('uid', { limit:3 });
    expect(picks.recommended).toHaveLength(3);
    expect(picks.reason).toBe('fallback');
  });
  it('splits buyAgain vs recommended', async()=>{
    const repo = createLocalPersonalizationRepository({ products, orderSlugsFor: async()=>[products[0]!.slug,products[0]!.slug], wishlistFor: async()=>[] });
    const picks = await repo.getPicks('uid',{limit:4});
    expect(picks.buyAgain[0]!.slug).toBe(products[0]!.slug);
  });
});
