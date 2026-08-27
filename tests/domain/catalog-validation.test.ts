import { describe, expect, it } from 'vitest';
import { validateProductInput } from '@/features/admin/catalog-validation';

const base = {
  nameEn: 'Test', nameAr: 'اختبار', descriptionEn: '', descriptionAr: '',
  category: 'hand-bouquet', occasions: ['birthday'], priceMinor: 12000, tone: '#bc6d63',
  imageUrl: '', delivery: 'Next-day', active: true,
  variants: [{ id: 'v1', nameEn: 'Classic', nameAr: 'كلاسيكي', priceDeltaMinor: 0, active: true, quantity: 5 }],
  addOns: [],
};

describe('validateProductInput', () => {
  it('accepts valid gift tags', () => {
    expect(validateProductInput({ ...base, giftRecipients: ['partner'], giftStyles: ['romantic'], giftColors: ['pink'] })).toBeNull();
  });

  it('rejects a non-canonical receiver tag', () => {
    expect(validateProductInput({ ...base, giftRecipients: ['uncle'] } as any)).toBe('invalid_gift_recipients');
  });

  it('rejects a non-canonical style or color tag', () => {
    expect(validateProductInput({ ...base, giftStyles: ['glitter'] } as any)).toBe('invalid_gift_styles');
    expect(validateProductInput({ ...base, giftColors: ['marble'] } as any)).toBe('invalid_gift_colors');
  });
});
