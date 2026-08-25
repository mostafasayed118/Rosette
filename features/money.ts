import type { Locale } from '@/features/i18n/types';

const intlLocales: Record<Locale, string> = { en: 'en-EG', ar: 'ar-EG', fr: 'fr-FR' };

export function formatMoney(minorUnits: number, locale: Locale = 'en') {
  // Non-finite values (NaN, undefined) render as an em dash so the UI never
  // shows a stray "NaN EGP". Negative values pass through; the locale's
  // Intl.NumberFormat renders them with the appropriate negative pattern,
  // which is correct for refunds and promo-discount lines.
  if (!Number.isFinite(minorUnits)) return '—';
  return new Intl.NumberFormat(intlLocales[locale], { style: 'currency', currency: 'EGP', maximumFractionDigits: 0 }).format(minorUnits / 100);
}
