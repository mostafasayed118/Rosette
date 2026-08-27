import { resolveServerLocale } from './server-locale';
import type { Locale } from './types';
import { createFormatter, translate, type LocaleFormatter } from './translate';

export type ServerT = {
  locale: Locale;
  t: (key: string, values?: Record<string, string | number>) => string;
  format: LocaleFormatter;
};

export async function getServerT(locale?: string): Promise<ServerT> {
  const value = locale ?? (await resolveServerLocale());
  const resolved: Locale = value === 'ar' || value === 'fr' ? value : 'en';
  return {
    locale: resolved,
    t: (key, values) => translate(resolved, key, values),
    format: createFormatter(resolved),
  };
}