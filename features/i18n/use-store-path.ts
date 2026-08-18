'use client';

import { useParams } from 'next/navigation';

/**
 * Build storefront links that carry the current `/{locale}/{city}` prefix.
 * Only valid inside the `[city]` segment; falls back to `en` / no city when
 * the params are absent (defensive).
 */
export function useStorePath() {
  const params = useParams();
  const locale = typeof params.locale === 'string' ? params.locale : 'en';
  const city = typeof params.city === 'string' ? params.city : '';
  const href = (path: string) => `/${locale}/${city}${path.startsWith('/') ? path : `/${path}`}`;
  return { locale, city, href };
}
