import type { Locale } from '@/features/i18n/types';

const BRAND_NAME = 'Rosette';
const BRAND_DESCRIPTION = 'Thoughtful, hand-tied seasonal flowers delivered across Egypt.';

function stripTrailingSlash(base: string): string {
  return base.replace(/\/$/, '');
}

export type OrganizationJsonLdInput = { base: string; locale: Locale | string; sameAs?: string[] };

/** Site-wide publisher identity — helps search engines attach the brand to the domain. */
export function buildOrganizationJsonLd({ base, locale, sameAs }: OrganizationJsonLdInput) {
  const origin = stripTrailingSlash(base);
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: BRAND_NAME,
    description: BRAND_DESCRIPTION,
    url: `${origin}/${locale}`,
    logo: `${origin}/icon.png`,
    ...(sameAs && sameAs.length > 0 ? { sameAs } : {}),
  } as const;
}

export type LocalBusinessJsonLdInput = { base: string; locale: Locale | string; cityName: string; citySlug: string };

/** Per-city storefront identity: a Florist that serves one delivery city. */
export function buildLocalBusinessJsonLd({ base, locale, cityName, citySlug }: LocalBusinessJsonLdInput) {
  const origin = stripTrailingSlash(base);
  return {
    '@context': 'https://schema.org',
    '@type': 'Florist',
    name: `${BRAND_NAME} — ${cityName}`,
    description: BRAND_DESCRIPTION,
    url: `${origin}/${locale}/${citySlug}`,
    image: `${origin}/icon.png`,
    address: { '@type': 'PostalAddress', addressCountry: 'EG', addressLocality: cityName },
    areaServed: { '@type': 'City', name: cityName },
    priceRange: 'EGP 350–EGP 3,200',
    currenciesAccepted: 'EGP',
  } as const;
}

export type BreadcrumbItem = { name: string; path?: string };
export type BreadcrumbJsonLdInput = { base: string; items: BreadcrumbItem[] };

/** Ordered trail for SERP breadcrumbs. The final crumb omits `item` (current page). */
export function buildBreadcrumbJsonLd({ base, items }: BreadcrumbJsonLdInput) {
  const origin = stripTrailingSlash(base);
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem' as const,
      position: index + 1,
      name: item.name,
      ...(item.path ? { item: `${origin}${item.path}` } : {}),
    })),
  } as const;
}
