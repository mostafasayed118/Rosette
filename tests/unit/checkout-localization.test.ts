import { describe, expect, it } from 'vitest';
import { translate } from '@/features/i18n/translate';

describe('checkout and cart localization', () => {
  it('uses locale-aware plural wording for cart item counts', () => {
    expect(translate('en', 'cartItemCount', { count: 1 })).toBe('1 item');
    expect(translate('en', 'cartItemCount', { count: 2 })).toBe('2 items');
    expect(translate('fr', 'cartItemCount', { count: 2 })).toBe('2 articles');
    expect(translate('ar', 'cartItemCount', { count: 2 })).toContain('عنصران');
  });

  it('provides localized accessible names for quantity controls', () => {
    expect(translate('en', 'decreaseQuantity')).toBe('Decrease quantity');
    expect(translate('fr', 'increaseQuantity')).toBe('Augmenter la quantité');
    expect(translate('ar', 'decreaseQuantity')).toBe('قلّل الكمية');
  });
});
