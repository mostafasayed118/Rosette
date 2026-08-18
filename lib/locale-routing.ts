import type { Locale } from '@/features/i18n/types';

export const LOCALES: Locale[] = ['en', 'ar', 'fr'];

export type LocaleRoutingDecision =
  | { type: 'redirect'; to: string }
  | { type: 'continue'; locale: Locale };

/**
 * Decide how to route a request path for the `/[locale]/...` scheme.
 * Pure and framework-free so it can be unit-tested; `middleware.ts` maps the
 * decision onto `NextResponse`.
 */
export function resolveLocaleRouting(pathname: string): LocaleRoutingDecision {
  if (pathname === '/') return { type: 'redirect', to: '/en' };
  const first = pathname.split('/').filter(Boolean)[0] ?? '';
  if (!(LOCALES as string[]).includes(first)) {
    return { type: 'redirect', to: `/en${pathname}` };
  }
  return { type: 'continue', locale: first as Locale };
}
