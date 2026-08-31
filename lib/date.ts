import type { Locale } from '@/features/i18n/types';

function localeTag(locale: Locale): string {
  switch (locale) {
    case 'ar':
      return 'ar-EG';
    case 'fr':
      return 'fr-FR';
    default:
      return 'en-GB';
  }
}

export function formatDateTime(value: string | Date, locale: Locale): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return date.toLocaleString(localeTag(locale), {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Africa/Cairo',
  });
}

export function formatDate(value: string | Date, locale: Locale): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return date.toLocaleDateString(localeTag(locale), {
    dateStyle: 'medium',
    timeZone: 'Africa/Cairo',
  });
}
