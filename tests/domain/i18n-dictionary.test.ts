import { describe, expect, it } from 'vitest';
import { messages } from '@/features/i18n/dictionaries';

describe('i18n dictionaries', () => {
  it('keeps every locale a superset of the English keys', () => {
    const enKeys = Object.keys(messages.en).sort();
    for (const locale of ['ar', 'fr'] as const) {
      const keys = Object.keys(messages[locale]).sort();
      expect(keys).toEqual(expect.arrayContaining(enKeys));
    }
  });
});
