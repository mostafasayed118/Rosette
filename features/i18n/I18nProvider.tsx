'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { createFormatter, translate, type LocaleFormatter } from './translate';
import { deferToTask } from '@/hooks/use-deferred-task';
import type { Locale } from './types';

const STORAGE_KEY = 'rosette.locale.v1';
type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, values?: Record<string, string | number>) => string;
  format: LocaleFormatter;
};
const I18nContext = createContext<I18nContextValue | null>(null);

function localeFromPath(pathname: string): Locale | null {
  const seg = pathname.split('/').filter(Boolean)[0];
  if (seg === 'ar' || seg === 'fr' || seg === 'en') return seg;
  return null;
}

export function I18nProvider({ children, initialLocale = 'en' }: { children: ReactNode; initialLocale?: Locale }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  const pathname = usePathname();
  const setLocale = (next: Locale) => {
    setLocaleState(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, next);
      document.cookie = `rosette.locale=${next}; path=/; max-age=31536000; samesite=lax`;
    }
  };
  useEffect(() => {
    // Deferred one frame: after hydration the pathname/localStorage snapshot
    // wins without cascading a render inside the commit phase. Only re-run on
    // pathname change to avoid a feedback loop where setLocaleState would
    // re-trigger this effect.
    deferToTask(() => {
      const fromPath = localeFromPath(pathname);
      if (fromPath && fromPath !== locale) {
        // Admin is EN/AR only — FR storefront selection falls back to EN in admin
        const next = pathname.startsWith('/admin') && fromPath === 'fr' ? 'en' : fromPath;
        if (next !== locale) {
          window.localStorage.setItem(STORAGE_KEY, next);
          document.cookie = `rosette.locale=${next}; path=/; max-age=31536000; samesite=lax`;
          setLocaleState(next as Locale);
        }
        return;
      }
      if (!fromPath) {
        const saved = window.localStorage.getItem(STORAGE_KEY);
        if (pathname.startsWith('/admin') && saved === 'fr') {
          if (locale !== 'en') {
            window.localStorage.setItem(STORAGE_KEY, 'en');
            document.cookie = `rosette.locale=en; path=/; max-age=31536000; samesite=lax`;
            setLocaleState('en');
          }
          return;
        }
        if ((saved === 'ar' || saved === 'en' || saved === 'fr') && saved !== locale) setLocaleState(saved as Locale);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- locale is read via the latest state inside the deferred callback; depending on it would cause a re-render loop.
  }, [pathname]);
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr';
  }, [locale]);
  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale,
      t: (key, values) => translate(locale, key, values),
      format: createFormatter(locale),
    }),
    [locale],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n must be used inside I18nProvider');
  return value;
}