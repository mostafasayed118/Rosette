import { describe, expect, it } from 'vitest';
import { validateRuleFields, validateCityFields } from '@/features/admin/delivery-validation';

describe('validateRuleFields', () => {
  it('accepts valid rule fields', () => {
    expect(validateRuleFields({ feeMinor: 7500, minimumOrderMinor: 0, cutoffHour: 14 })).toBeNull();
  });
  it('rejects negative fee', () => {
    expect(validateRuleFields({ feeMinor: -1, minimumOrderMinor: 0, cutoffHour: 14 })).toBe('invalid_fee');
  });
  it('rejects fractional minimum', () => {
    expect(validateRuleFields({ feeMinor: 7500, minimumOrderMinor: 1.5, cutoffHour: 14 })).toBe('invalid_minimum');
  });
  it('rejects cutoff outside 0–23', () => {
    expect(validateRuleFields({ feeMinor: 7500, minimumOrderMinor: 0, cutoffHour: 24 })).toBe('invalid_cutoff');
    expect(validateRuleFields({ feeMinor: 7500, minimumOrderMinor: 0, cutoffHour: -1 })).toBe('invalid_cutoff');
  });
});

describe('validateCityFields', () => {
  it('accepts valid city fields', () => {
    expect(validateCityFields({ code: 'greater-cairo', nameEn: 'Greater Cairo', nameAr: 'القاهرة الكبرى', feeMinor: 7500, minimumOrderMinor: 0, cutoffHour: 14 })).toBeNull();
  });
  it('rejects bad city codes', () => {
    expect(validateCityFields({ code: 'Greater Cairo', nameEn: 'G', nameAr: 'ق', feeMinor: 7500, minimumOrderMinor: 0, cutoffHour: 14 })).toBe('invalid_code');
    expect(validateCityFields({ code: 'cairo_', nameEn: 'G', nameAr: 'ق', feeMinor: 7500, minimumOrderMinor: 0, cutoffHour: 14 })).toBe('invalid_code');
  });
  it('rejects empty names', () => {
    expect(validateCityFields({ code: 'new-city', nameEn: '  ', nameAr: 'قاهرة', feeMinor: 7500, minimumOrderMinor: 0, cutoffHour: 14 })).toBe('name_required');
  });
  it('propagates rule validation', () => {
    expect(validateCityFields({ code: 'new-city', nameEn: 'X', nameAr: 'ص', feeMinor: 0, minimumOrderMinor: 0, cutoffHour: 99 })).toBe('invalid_cutoff');
  });
});
