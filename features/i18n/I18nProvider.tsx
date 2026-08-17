'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { messages } from './dictionaries';
import type { Locale } from './types';

const STORAGE_KEY = 'rosette.locale.v1';
type I18nContextValue = { locale: Locale; setLocale: (locale: Locale) => void; t: (key: string, values?: Record<string, string | number>) => string };
const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('en');
  const setLocale = (next: Locale) => { setLocaleState(next); if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, next); };
  useEffect(() => { const saved = window.localStorage.getItem(STORAGE_KEY); if (saved === 'ar' || saved === 'en') setLocaleState(saved); }, []);
  useEffect(() => { document.documentElement.lang = locale; document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr'; }, [locale]);
  const value = useMemo<I18nContextValue>(() => ({ locale, setLocale, t: (key, values) => { let text = messages[locale][key] ?? messages.en[key] ?? key; for (const [name, value] of Object.entries(values ?? {})) text = text.replaceAll(`{${name}}`, String(value)); return text; } }), [locale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() { const value = useContext(I18nContext); if (!value) throw new Error('useI18n must be used inside I18nProvider'); return value; }
