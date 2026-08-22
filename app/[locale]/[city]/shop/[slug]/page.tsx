import { cache } from 'react';
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
import type { Locale } from '@/features/i18n/types';

type ProductPageParams = { params: Promise<{ locale: string; city: string; slug: string }> };

const getProduct = cache((slug: string) => getCatalogRepository().getBySlug(slug));

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
  const { t } = await getServerT(locale);
  const product = await getProduct(slug);
  const shopHref = `/${locale}/${city}/shop`;
  // Delegate to the route's not-found boundary so the response is a real HTTP 404
  // instead of a soft 404 that search engines would index.
  if (!product) notFound();
  const reviewData = await getApprovedReviews(product.slug);
  const base = (getOptionalServerEnv('SITE_URL') ?? 'http://localhost:3000').replace(/\/$/, '');
  return <div className="flex min-h-screen flex-col"><ProductJsonLd product={product} reviews={reviewData?.reviews} /><BreadcrumbJsonLd base={base} items={[{ name: t('shop'), path: `/${locale}/${city}` }, { name: t('collectionTitle'), path: shopHref }, { name: product.name }]} /><SiteHeader /><main className="mx-auto w-[min(calc(100%-3rem),80rem)] py-12 pb-24 max-md:w-[min(calc(100%-2rem),80rem)] max-md:pt-4"><Link className="text-sm text-primary underline underline-offset-4" href={shopHref}>← {t('backCollection')}</Link><ProductDetail product={product} /><ProductReviews productSlug={product.slug} locale={locale} data={reviewData} /></main><SiteFooter locale={locale} city={city} /></div>;
}
