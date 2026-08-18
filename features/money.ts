import type { Locale } from '@/features/i18n/types';

const intlLocales: Record<Locale, string> = { en: 'en-EG', ar: 'ar-EG', fr: 'fr-FR' };

export function formatMoney(minorUnits: number, locale: Locale = 'en') {
  return new Intl.NumberFormat(intlLocales[locale], { style: 'currency', currency: 'EGP', maximumFractionDigits: 0 }).format(minorUnits / 100);
}
