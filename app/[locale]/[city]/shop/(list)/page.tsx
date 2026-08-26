import { Suspense } from 'react';
import type { Metadata } from 'next';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { CatalogGrid } from '@/features/catalog/CatalogGrid';
import { CatalogPagination } from '@/features/catalog/CatalogPagination';
import { BreadcrumbJsonLd } from '@/components/seo/SiteJsonLd';
import { LocalizedPageHeading } from '@/features/i18n/LocalizedPageHeading';
import { CatalogToolbar } from '@/features/catalog/CatalogToolbar';
import { parseCatalogQuery } from '@/features/catalog/catalog-utils';
import { getCatalogRepository } from '@/features/catalog/provider';
import { buildLocalizedPageMetadata } from '@/features/seo/page-metadata';
import { getServerT } from '@/features/i18n/server';
import { getOptionalServerEnv } from '@/lib/server-env';
import { LOCALES } from '@/lib/locale-routing';
import { createClient } from '@/lib/supabase/server';
import { BuyAgainStrip } from '@/features/personalization/components/BuyAgainStrip';
import { RecommendedCarousel } from '@/features/personalization/components/RecommendedCarousel';
import { PersonalizationSkeleton } from '@/features/personalization/components/PersonalizationSkeleton';
import { getPersonalizationProvider } from '@/features/personalization/provider';
import type { PersonalizationPicks } from '@/features/personalization/types';
import type { Locale } from '@/features/i18n/types';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type ShopPageParams = { params: Promise<{ locale: string; city: string }>; searchParams: SearchParams };

export async function generateMetadata({ params }: ShopPageParams): Promise<Metadata> {
  const { locale, city } = await params;
  const resolvedLocale: Locale = (LOCALES as string[]).includes(locale) ? (locale as Locale) : 'en';
  const { t } = await getServerT(resolvedLocale);
  const base = (getOptionalServerEnv('SITE_URL') ?? 'http://localhost:3000').replace(/\/$/, '');
  return buildLocalizedPageMetadata({ locale: resolvedLocale, city, path: '/shop', base, title: t('collectionTitle'), description: t('collectionLede') });
}

export default async function ShopPage({ params, searchParams }: ShopPageParams) {
  const { locale, city } = await params;
  const resolvedLocale: Locale = (LOCALES as string[]).includes(locale) ? (locale as Locale) : 'en';
  const raw = await searchParams;
  const queryParams = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) if (typeof value === 'string') queryParams.set(key, value);
  const query = parseCatalogQuery(queryParams);
  const result = await getCatalogRepository().list(query);
  const { t } = await getServerT(resolvedLocale);
  const base = (getOptionalServerEnv('SITE_URL') ?? 'http://localhost:3000').replace(/\/$/, '');

  const supabase = createClient();
  const { data: { user } } = await (supabase as any).auth.getUser();
  let personalization: PersonalizationPicks | null = null;
  if (user && process.env.ROSETTE_PERSONALIZATION_ENABLED !== 'false') {
    try {
      personalization = await getPersonalizationProvider().getPicks(user.id, { limit: 8, locale: resolvedLocale });
    } catch {
      personalization = null;
    }
  }
  const showStrips = personalization && (personalization.buyAgain.length > 0 || personalization.recommended.length > 0);

  return <div className="flex min-h-screen flex-col"><BreadcrumbJsonLd base={base} items={[{ name: t('shop'), path: `/${locale}/${city}` }, { name: t('collectionTitle') }]} /><SiteHeader /><main className="mx-auto w-[min(calc(100%-3rem),80rem)] py-12 pb-24 max-md:w-[min(calc(100%-2rem),80rem)] max-md:pt-4"><LocalizedPageHeading eyebrow="collectionEyebrow" title="collectionTitle" lede="collectionLede" action="changeDestination" actionHref={`/${locale}`} values={{ count: result.total }} />{showStrips ? (<Suspense fallback={<PersonalizationSkeleton />}><BuyAgainStrip products={personalization!.buyAgain} /><RecommendedCarousel products={personalization!.recommended} /></Suspense>) : null}<CatalogToolbar /><CatalogGrid products={result.products} /><CatalogPagination page={result.page} perPage={result.perPage} totalPages={result.totalPages} total={result.total} /></main><SiteFooter locale={locale} city={city} /></div>;
}
