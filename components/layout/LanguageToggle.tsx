'use client';

import { useI18n } from '@/features/i18n/I18nProvider';

export function LanguageToggle() { const { locale, setLocale, t } = useI18n(); return <button className="language-toggle" type="button" onClick={() => setLocale(locale === 'en' ? 'ar' : 'en')} aria-label={t('language')}>{t('language')}</button>; }
