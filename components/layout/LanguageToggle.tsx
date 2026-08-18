'use client';

import { useI18n } from '@/features/i18n/I18nProvider';
import type { Locale } from '@/features/i18n/types';

const cycle: Locale[] = ['en', 'ar', 'fr'];

export function LanguageToggle() {
  const { locale, setLocale, t } = useI18n();
  const next = cycle[(cycle.indexOf(locale) + 1) % cycle.length] ?? 'en';
  return <button className="grid h-11 min-w-11 place-items-center rounded-full px-2 text-xs font-bold text-primary hover:bg-accent" type="button" onClick={() => setLocale(next)} aria-label={t('language')}>{t('language')}</button>;
}
