import { cookies } from 'next/headers';
import type { Locale } from './types';

/**
 * Resolve the current locale for server components. Storefront pages pass the
 * locale from their `[locale]` route segment explicitly (see `getServerT`);
 * this cookie is the fallback for non-prefixed routes like `/admin` and
 * `/login`, where the locale is chosen by the client toggle.
 */
export async function resolveServerLocale(): Promise<Locale> {
  const cookieValue = (await cookies()).get('rosette.locale')?.value;
  return cookieValue === 'ar' || cookieValue === 'fr' ? cookieValue : 'en';
}
