import { describe, expect, it } from 'vitest';
import { messages } from '@/features/i18n/dictionaries';

const KEYS = [
  'occasionsTitle', 'occasionsEyebrow', 'occasionsLede', 'occasionsEmpty', 'occasionsEmptyHint',
  'addDate', 'editDate', 'removeDate', 'remindDaysBefore',
  'recurrenceAnnual', 'recurrenceOnce', 'occasionRecipient', 'occasionRelationship',
  'occasionKind_birthday', 'occasionKind_anniversary', 'occasionKind_graduation', 'occasionKind_other',
  'occasionSaved', 'occasionRemoved', 'occasionInvalid',
  'occasionMonth', 'occasionDay', 'occasionDate', 'occasionKindLegend', 'occasionRecurrenceLegend',
] as const;

describe('occasion i18n keys', () => {
  for (const locale of ['en', 'ar', 'fr'] as const) {
    it(`defines every occasion key in ${locale}`, () => {
      const missing = KEYS.filter((key) => !messages[locale][key]);
      expect(missing).toEqual([]);
    });
  }

  it('uses Arabic script for the Arabic strings', () => {
    expect(messages.ar.occasionsTitle).toMatch(/[\u0600-\u06FF]/);
  });

  it('does not leave a locale copying the English string verbatim', () => {
    expect(messages.ar.occasionsTitle).not.toBe(messages.en.occasionsTitle);
    expect(messages.fr.occasionsTitle).not.toBe(messages.en.occasionsTitle);
  });
});
