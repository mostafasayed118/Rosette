import type { Locale } from '@/features/i18n/types';

const intlLocales: Record<Locale, string> = { en: 'en-EG', ar: 'ar-EG', fr: 'fr-FR' };

// Memoize Intl.NumberFormat instances keyed by `${locale}:${currency}` so we
// don't allocate a new formatter on every call (R-31).
const formatters = new Map<string, Intl.NumberFormat>();

function getMoneyFormatter(locale: Locale): Intl.NumberFormat {
  const key = `${locale}:EGP`;
  let fmt = formatters.get(key);
  if (!fmt) {
    fmt = new Intl.NumberFormat(intlLocales[locale], {
      style: 'currency',
      currency: 'EGP',
      maximumFractionDigits: 0,
    });
    formatters.set(key, fmt);
  }
  return fmt;
}

export function formatMoney(minorUnits: number, locale: Locale = 'en') {
  // Non-finite values (NaN, undefined) render as an em dash so the UI never
  // shows a stray "NaN EGP". Negative values pass through; the locale's
  // Intl.NumberFormat renders them with the appropriate negative pattern,
  // which is correct for refunds and promo-discount lines.
  if (!Number.isFinite(minorUnits)) return '—';
  return getMoneyFormatter(locale).format(minorUnits / 100);
}
