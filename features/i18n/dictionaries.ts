import type { Locale } from './types';
import en from './locales/en.json';
import ar from './locales/ar.json';
import fr from './locales/fr.json';

export const messages: Record<Locale, Record<string, string>> = {
  en: en as Record<string, string>,
  ar: ar as Record<string, string>,
  fr: fr as Record<string, string>,
};

export type { Locale };