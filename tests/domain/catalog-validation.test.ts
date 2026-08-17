import { describe, expect, it } from 'vitest';
import { slugify, validateProductInput, type SaveProductInput } from '@/features/admin/catalog-validation';

const base: SaveProductInput = {
  nameEn: 'Rose Hour', nameAr: 'ساعة الورد', descriptionEn: '', descriptionAr: '',
  category: 'hand-bouquet', occasions: ['birthday'], priceMinor: 12000, tone: '#bc6d63',
  delivery: 'Same-day', active: true,
  variants: [{ nameEn: 'Classic', nameAr: 'كلاسيكي', priceDeltaMinor: 0, active: true, quantity: 5 }],
  addOns: [],
};

describe('slugify', () => {
  it('lowercases and dashes spaces', () => {
    expect(slugify('Rose Hour')).toBe('rose-hour');
  });
  it('trims and collapses runs', () => {
    expect(slugify('  Little   Thanks  ')).toBe('little-thanks');
  });
  it('returns empty for non-ascii or empty input', () => {
    expect(slugify('ورد أحمر')).toBe('');
    expect(slugify('')).toBe('');
  });
});

describe('validateProductInput', () => {
  it('accepts a valid product', () => {
    expect(validateProductInput(base)).toBeNull();
  });
  it('rejects missing names and unslugifiable nameEn', () => {
    expect(validateProductInput({ ...base, nameEn: '' })).toBe('names_required');
    expect(validateProductInput({ ...base, nameEn: 'ورد' })).toBe('slug_required');
  });
  it('rejects unknown category or occasions', () => {
    expect(validateProductInput({ ...base, category: 'bogus' })).toBe('invalid_category');
    expect(validateProductInput({ ...base, occasions: ['bogus'] })).toBe('invalid_occasion');
  });
  it('rejects bad price, tone, delivery', () => {
    expect(validateProductInput({ ...base, priceMinor: -1 })).toBe('invalid_price');
    expect(validateProductInput({ ...base, tone: 'red' })).toBe('invalid_tone');
    expect(validateProductInput({ ...base, delivery: '  ' })).toBe('invalid_delivery');
  });
  it('rejects missing variants and bad variant fields', () => {
    expect(validateProductInput({ ...base, variants: [] })).toBe('variants_required');
    expect(validateProductInput({ ...base, variants: [{ nameEn: '', nameAr: 'كلاسيكي', priceDeltaMinor: 0, active: true, quantity: 5 }] })).toBe('variant_name_required');
    expect(validateProductInput({ ...base, variants: [{ nameEn: 'Classic', nameAr: 'كلاسيكي', priceDeltaMinor: 0, active: true, quantity: -2 }] })).toBe('invalid_quantity');
  });
  it('rejects bad add-ons', () => {
    expect(validateProductInput({ ...base, addOns: [{ id: '', nameEn: 'Note', nameAr: '', priceMinor: 500 }] })).toBe('addon_required');
    expect(validateProductInput({ ...base, addOns: [{ id: 'note', nameEn: 'Note', nameAr: '', priceMinor: -1 }] })).toBe('invalid_addon_price');
  });
});
