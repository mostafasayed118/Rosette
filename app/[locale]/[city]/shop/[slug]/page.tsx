import { cache } from 'react';
import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { ProductDetail } from '@/features/product/ProductDetail';
import { ProductReviews } from '@/components/reviews/ProductReviews';
import { ProductJsonLd } from '@/components/seo/ProductJsonLd';
import { BreadcrumbJsonLd } from '@/components/seo/SiteJsonLd';
import { getApprovedReviews } from '@/features/reviews/get-approved-reviews';
import { getCatalogRepository } from '@/features/catalog/provider';
import { buildProductMetadata } from '@/features/seo/product-metadata';
import { getServerT } from '@/features/i18n/server';
import { getOptionalServerEnv } from '@/lib/server-env';
import { LOCALES } from '@/lib/locale-routing';
import { categoryMessageKeys } from '@/features/catalog/catalog-labels';
import { products as catalogProducts } from '@/features/catalog/data';
import { createClient } from '@/lib/supabase/server';
import { RecommendedCarousel } from '@/features/personalization/components/RecommendedCarousel';
import { PersonalizationSkeleton } from '@/features/personalization/components/PersonalizationSkeleton';
import { getPersonalizationProvider } from '@/features/personalization/provider';
import type { PersonalizationPicks } from '@/features/personalization/types';
import type { Locale } from '@/features/i18n/types';

type ProductPageParams = { params: Promise<{ locale: string; city: string; slug: string }> };

// Catalog data is cacheable for an hour (R-08).
export const revalidate = 3600;

const getProduct = cache((slug: string) => getCatalogRepository().getBySlug(slug));

export async function generateStaticParams() {
  try {
    // In supabase-backed deployments the real slugs live in the database and
    // can't be fetched at build without a DB/cookies call, so we let those
    // render on demand via ISR (revalidate). Only the local/demo catalog has a
    // cheap, build-time slug list.
    if (getOptionalServerEnv('NEXT_PUBLIC_SUPABASE_URL')) return [];
    return catalogProducts.map((product) => ({ slug: product.slug }));
  } catch {
    return [];
  }
}

export async function generateMetadata({ params }: ProductPageParams): Promise<Metadata> {
  const { locale, city, slug } = await params;
  const product = await getProduct(slug);
  const base = (getOptionalServerEnv('SITE_URL') ?? 'http://localhost:3000').replace(/\/$/, '');
  const resolvedLocale: Locale = (LOCALES as string[]).includes(locale) ? (locale as Locale) : 'en';
  // Unknown slugs render the not-found boundary, so keep crawlers away from this metadata.
  if (!product) return { title: 'Not found', robots: { index: false, follow: false } };
  return buildProductMetadata({ product, locale: resolvedLocale, city, base });
}

export default async function ProductPage({ params }: ProductPageParams) {
  const { locale, city, slug } = await params;
  const resolvedLocale: Locale = (LOCALES as string[]).includes(locale) ? (locale as Locale) : 'en';
  const { t } = await getServerT(resolvedLocale);
  const product = await getProduct(slug);
  const shopHref = `/${locale}/${city}/shop`;
  // Delegate to the route's not-found boundary so the response is a real HTTP 404
  // instead of a soft 404 that search engines would index.
  if (!product) notFound();
  const reviewData = await getApprovedReviews(product.slug);
  const base = (getOptionalServerEnv('SITE_URL') ?? 'http://localhost:3000').replace(/\/$/, '');

  return <div className="flex min-h-screen flex-col"><ProductJsonLd product={product} reviews={reviewData?.reviews} /><BreadcrumbJsonLd base={base} items={[{ name: t('shop'), path: `/${locale}/${city}` }, { name: t('collectionTitle'), path: shopHref }, { name: product.name }]} /><SiteHeader /><main id="main-content" className="mx-auto w-[min(calc(100%-3rem),80rem)] py-12 pb-24 max-md:w-[min(calc(100%-2rem),80rem)] max-md:pt-4"><Link className="text-sm text-primary underline underline-offset-4" href={shopHref}>← {t('backCollection')}</Link><ProductDetail product={product} /><ProductReviews productSlug={product.slug} locale={locale} data={reviewData} /><Suspense fallback={<PersonalizationSkeleton />}><PersonalizationSection locale={resolvedLocale} excludeSlug={slug} /></Suspense></main><SiteFooter locale={locale} city={city} /></div>;
}

/**
 * Personalized "you may also like" strip. It performs its own Supabase auth
 * read (which opts only THIS boundary into dynamic rendering) so the rest of
 * the product page stays static/ISR. If the user is anonymous or personalization
 * is disabled, it renders nothing.
 */
async function PersonalizationSection({ locale, excludeSlug }: { locale: Locale; excludeSlug: string }) {
  const { t } = await getServerT(locale);
  let personalization: PersonalizationPicks | null = null;
  if (process.env.ROSETTE_PERSONALIZATION_ENABLED !== 'false') {
    try {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        personalization = await (await getPersonalizationProvider()).getPicks(user.id, { limit: 8, locale, excludeSlug });
      }
    } catch {
      personalization = null;
    }
  }
  if (!personalization || personalization.recommended.length === 0) return null;
  const hintCategoryKey = personalization.hintCategory
    ? t(categoryMessageKeys[personalization.hintCategory] ?? personalization.hintCategory)
    : null;
  return <RecommendedCarousel products={personalization.recommended} category={hintCategoryKey ?? undefined} />;
}
