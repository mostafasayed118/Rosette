import type { Locale } from './types';

export function pickLocalized(locale: Locale, values: { en: string; ar?: string; fr?: string }): string {
  if (locale === 'ar' && values.ar) return values.ar;
  if (locale === 'fr' && values.fr) return values.fr;
  return values.en;
}
