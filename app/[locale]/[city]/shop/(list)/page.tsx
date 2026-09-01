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
import { listCatalogCategories } from '@/features/catalog/categories';
import { buildLocalizedPageMetadata } from '@/features/seo/page-metadata';
import { getServerT } from '@/features/i18n/server';
import { storeBasePath, storeHref } from '@/features/i18n/store-path';
import { getOptionalServerEnv } from '@/lib/server-env';
import { LOCALES } from '@/lib/locale-routing';
import { categoryMessageKeys } from '@/features/catalog/catalog-labels';
import { createClient } from '@/lib/supabase/server';
import { BuyAgainStrip } from '@/features/personalization/components/BuyAgainStrip';
import { RecommendedCarousel } from '@/features/personalization/components/RecommendedCarousel';
import { PersonalizationSkeleton } from '@/features/personalization/components/PersonalizationSkeleton';
import { getPersonalizationProvider } from '@/features/personalization/provider';
import type { PersonalizationPicks } from '@/features/personalization/types';
import type { Locale } from '@/features/i18n/types';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type ShopPageParams = { params: Promise<{ locale: string; city: string }>; searchParams: SearchParams };

// Catalog data is cacheable for an hour (R-08).
export const revalidate = 3600;

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
  const [result, catalogCategories] = await Promise.all([
    getCatalogRepository().list(query),
    listCatalogCategories(),
  ]);
  const { t } = await getServerT(resolvedLocale);
  const base = (getOptionalServerEnv('SITE_URL') ?? 'http://localhost:3000').replace(/\/$/, '');
  const basePath = storeBasePath(locale, city);
  const href = (path: string) => storeHref(basePath, path);

  return <div className="flex min-h-screen flex-col"><BreadcrumbJsonLd base={base} items={[{ name: t('shop'), path: `/${locale}/${city}` }, { name: t('collectionTitle') }]} /><SiteHeader /><main id="main-content" className="mx-auto w-[min(calc(100%-3rem),80rem)] py-12 pb-24 max-md:w-[min(calc(100%-2rem),80rem)] max-md:pt-4"><LocalizedPageHeading eyebrow="collectionEyebrow" title="collectionTitle" lede="collectionLede" action="changeDestination" actionHref={`/${locale}`} values={{ count: result.total }} /><Suspense fallback={<PersonalizationSkeleton />}><PersonalizationSection locale={resolvedLocale} basePath={basePath} /></Suspense><CatalogToolbar availableCategories={catalogCategories.map((category) => category.slug)} /><CatalogGrid products={result.products} locale={resolvedLocale} href={href} /><CatalogPagination page={result.page} perPage={result.perPage} totalPages={result.totalPages} total={result.total} /></main><SiteFooter locale={locale} city={city} /></div>;
}

/**
 * Personalized "buy again" + "recommended" strips. It performs its own Supabase
 * auth read (which opts only THIS boundary into dynamic rendering) so the rest
 * of the catalog page stays static/ISR. If the user is anonymous or
 * personalization is disabled, it renders nothing.
 */
async function PersonalizationSection({ locale, basePath }: { locale: Locale; basePath: string }) {
  const { t } = await getServerT(locale);
  let personalization: PersonalizationPicks | null = null;
  if (process.env.ROSETTE_PERSONALIZATION_ENABLED !== 'false') {
    try {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        personalization = await (await getPersonalizationProvider()).getPicks(user.id, { limit: 8, locale });
      }
    } catch {
      personalization = null;
    }
  }
  if (!personalization) return null;
  const hasStrips = personalization.buyAgain.length > 0 || personalization.recommended.length > 0;
  if (!hasStrips) return null;
  const hintCategoryKey = personalization.hintCategory
    ? t(categoryMessageKeys[personalization.hintCategory] ?? personalization.hintCategory)
    : null;
  const href = (path: string) => storeHref(basePath, path);
  return (<><BuyAgainStrip products={personalization.buyAgain} locale={locale} href={href} /><RecommendedCarousel products={personalization.recommended} locale={locale} href={href} category={hintCategoryKey ?? undefined} /></>);
}
