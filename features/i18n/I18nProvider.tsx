'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { messages } from './dictionaries';
import type { Locale } from './types';

const STORAGE_KEY = 'rosette.locale.v1';
type I18nContextValue = { locale: Locale; setLocale: (locale: Locale) => void; t: (key: string, values?: Record<string, string | number>) => string };
const I18nContext = createContext<I18nContextValue | null>(null);

/** Storefront routes carry the locale in their first path segment. */
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
  // URL-prefixed storefront pages are authoritative for the locale (SSR and
  // hydration agree via initialLocale); localStorage only steers non-prefixed
  // routes like /admin where no segment exists. Depend only on pathname so the
  // effect does not re-run on every locale change for no-op work.
  useEffect(() => {
    const fromPath = localeFromPath(pathname);
    if (fromPath && fromPath !== locale) {
      window.localStorage.setItem(STORAGE_KEY, fromPath);
      document.cookie = `rosette.locale=${fromPath}; path=/; max-age=31536000; samesite=lax`;
      setLocaleState(fromPath);
      return;
    }
    if (!fromPath) {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if ((saved === 'ar' || saved === 'en' || saved === 'fr') && saved !== locale) setLocaleState(saved);
    }
  }, [pathname, locale]);
  useEffect(() => { document.documentElement.lang = locale; document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr'; }, [locale]);
  const value = useMemo<I18nContextValue>(() => ({ locale, setLocale, t: (key, values) => { let text = messages[locale][key] ?? messages.en[key] ?? key; for (const [name, value] of Object.entries(values ?? {})) text = text.replaceAll(`{${name}}`, String(value)); return text; } }), [locale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() { const value = useContext(I18nContext); if (!value) throw new Error('useI18n must be used inside I18nProvider'); return value; }
