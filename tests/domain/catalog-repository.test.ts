import { describe, expect, it } from 'vitest';
import { mapSupabaseProduct } from '@/features/catalog/row-mappers';

describe('Supabase catalog mapping', () => {
  it('maps bilingual product data, variants, add-ons, and inventory', () => {
    expect(mapSupabaseProduct({
      slug: 'rose-hour',
      name_en: 'Rose Hour',
      name_ar: 'ساعة الورد',
      description_en: 'Soft garden roses',
      description_ar: 'ورود حدائق ناعمة',
      category: 'hand-bouquet',
      occasions: ['birthday'],
      price_minor: 12000,
      tone: '#bc6d63',
      delivery: 'Same-day',
      created_at: '2026-01-02',
      add_ons: [{ id: 'note', name_en: 'Handwritten note', name_ar: 'بطاقة', price_minor: 500 }],
      product_variants: [
        { id: 'classic', name_en: 'Classic', name_ar: 'كلاسيكي', price_delta_minor: 0, inventory: [{ quantity: 8, reserved_quantity: 1 }] },
        { id: 'generous', name_en: 'Generous', name_ar: 'سخي', price_delta_minor: 4500, inventory: [{ quantity: 5, reserved_quantity: 0 }] },
      ],
    })).toMatchObject({
      slug: 'rose-hour',
      name: 'Rose Hour',
      nameAr: 'ساعة الورد',
      price: 12000,
      inventory: 12,
      variants: [
        { id: 'classic', name: 'Classic', priceDelta: 0 },
        { id: 'generous', name: 'Generous', priceDelta: 4500 },
      ],
      addOns: [{ id: 'note', name: 'Handwritten note', price: 500 }],
    });
  });
});
