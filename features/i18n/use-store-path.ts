'use client';

import { useParams } from 'next/navigation';
import { storeBasePath, storeHref } from './store-path';

/**
 * Build storefront links that carry the current `/{locale}/{city}` prefix.
 * Only valid inside the `[city]` segment; falls back to `en` / no city when
 * the params are absent (defensive).
 */
export function useStorePath() {
  const params = useParams();
  const locale = typeof params.locale === 'string' ? params.locale : 'en';
  const city = typeof params.city === 'string' ? params.city : '';
  const basePath = storeBasePath(locale, city);
  return { locale, city, basePath, href: (path: string) => storeHref(basePath, path) };
}
