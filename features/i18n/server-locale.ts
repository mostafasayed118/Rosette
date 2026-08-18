import { cookies, headers } from 'next/headers';
import type { Locale } from './types';

/**
 * Resolve the current locale for server components. Middleware sets the
 * `x-locale` request header from the URL's first segment, so this is the
 * source of truth for localized pages; the cookie (persisted by the client
 * toggle) is a fallback for non-prefixed routes like `/admin`.
 */
export async function resolveServerLocale(): Promise<Locale> {
  const headerValue = (await headers()).get('x-locale');
  const cookieValue = (await cookies()).get('rosette.locale')?.value;
  const value = headerValue ?? cookieValue;
  return value === 'ar' || value === 'fr' ? value : 'en';
}

/** The city code from the URL's second segment (set by middleware). */
export async function resolveServerCity(): Promise<string | null> {
  return (await headers()).get('x-city') ?? null;
}

export async function resolveServerPath(): Promise<{ locale: Locale; city: string | null }> {
  return { locale: await resolveServerLocale(), city: await resolveServerCity() };
}
