import { describe, expect, it } from 'vitest';
import { mapSupabaseProduct } from '@/features/catalog/row-mappers';

const row = {
  slug: 'rose-hour',
  name_en: 'Rose Hour', name_ar: 'ساعة الورد', name_fr: 'L’Heure des Roses',
  description_en: 'd', description_ar: 'd', description_fr: 'd',
  category: 'hand-bouquet', occasions: ['birthday', 'love'],
  price_minor: 12000, tone: '#bc6d63', image_url: null, delivery: 'Same-day',
  created_at: '2026-01-02',
  gift_recipients: ['partner', 'family'], gift_styles: ['romantic'], gift_colors: ['pink', 'pastel'],
  add_ons: [], product_variants: [],
};

describe('mapSupabaseProduct', () => {
  it('maps gift tag columns onto the product', () => {
    const product = mapSupabaseProduct(row);
    expect(product.giftRecipients).toEqual(['partner', 'family']);
    expect(product.giftStyles).toEqual(['romantic']);
    expect(product.giftColors).toEqual(['pink', 'pastel']);
  });

  it('defaults missing gift tags to empty arrays', () => {
    const { gift_recipients: _r, gift_styles: _s, gift_colors: _c, ...noTags } = row;
    const product = mapSupabaseProduct(noTags as typeof row);
    expect(product.giftRecipients).toEqual([]);
    expect(product.giftStyles).toEqual([]);
    expect(product.giftColors).toEqual([]);
  });
});
