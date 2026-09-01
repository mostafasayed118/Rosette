import { getServerT, type ServerT } from './server';
import { createFormatter, translate } from './translate';
import type { Locale } from './types';

type AdminLocale = 'en' | 'ar';

/**
 * Admin is EN/AR only — FR (storefront) falls back to EN.
 * Storefront keeps full en/ar/fr via `getServerT()`.
 */
export async function getAdminServerT(): Promise<ServerT & { locale: AdminLocale }> {
  const { locale: raw } = await getServerT();
  const locale: AdminLocale = raw === 'ar' ? 'ar' : 'en';
  return {
    locale,
    t: (key, values) => translate(locale, key, values),
    format: createFormatter(locale),
  };
}
