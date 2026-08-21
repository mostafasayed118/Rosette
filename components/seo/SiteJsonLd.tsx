import { buildBreadcrumbJsonLd, buildLocalBusinessJsonLd, buildOrganizationJsonLd, type BreadcrumbItem } from '@/features/seo/site-jsonld';
import type { Locale } from '@/features/i18n/types';

function JsonLd({ data }: { data: object }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />;
}

export function OrganizationJsonLd({ base, locale, sameAs }: { base: string; locale: Locale | string; sameAs?: string[] }) {
  return <JsonLd data={buildOrganizationJsonLd({ base, locale, sameAs })} />;
}

export function LocalBusinessJsonLd({ base, locale, cityName, citySlug }: { base: string; locale: Locale | string; cityName: string; citySlug: string }) {
  return <JsonLd data={buildLocalBusinessJsonLd({ base, locale, cityName, citySlug })} />;
}

export function BreadcrumbJsonLd({ base, items }: { base: string; items: BreadcrumbItem[] }) {
  if (items.length === 0) return null;
  return <JsonLd data={buildBreadcrumbJsonLd({ base, items })} />;
}
