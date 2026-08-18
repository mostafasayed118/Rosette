import { describe, expect, it } from 'vitest';
import { pickLocalized } from '@/features/i18n/pick';

describe('pickLocalized', () => {
  const values = { en: 'Rose', ar: 'ورد', fr: 'Rose' };
  it('prefers the active locale and falls back to English', () => {
    expect(pickLocalized('en', values)).toBe('Rose');
    expect(pickLocalized('ar', values)).toBe('ورد');
    expect(pickLocalized('fr', values)).toBe('Rose');
  });
  it('falls back to English when the active locale has no value', () => {
    expect(pickLocalized('fr', { en: 'Rose', ar: 'ورد' })).toBe('Rose');
    expect(pickLocalized('ar', { en: 'Rose' })).toBe('Rose');
  });
});
