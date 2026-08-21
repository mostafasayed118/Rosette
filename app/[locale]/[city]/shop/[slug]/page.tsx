import { cache } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
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
  if (!product) return { title: 'Not found' };
  return buildProductMetadata({ product, locale: resolvedLocale, city, base });
}

export default async function ProductPage({ params }: ProductPageParams) {
  const { locale, city, slug } = await params;
  const { t } = await getServerT(locale);
  const product = await getProduct(slug);
  const shopHref = `/${locale}/${city}/shop`;
  if (!product) return <main className="mx-auto grid min-h-[70vh] w-[min(calc(100%-3rem),80rem)] place-content-center justify-items-start"><p className="text-xs font-bold uppercase tracking-[.16em] text-sage">{t('productNotFoundEyebrow')}</p><h1 className="mt-2 mb-6 max-w-[12ch] font-display text-[clamp(2.5rem,6vw,4.5rem)] leading-[.95]">{t('productNotFoundTitle')}</h1><Button asChild><Link href={shopHref}>{t('backCollection')} ↗</Link></Button></main>;
  const reviewData = await getApprovedReviews(product.slug);
  const base = (getOptionalServerEnv('SITE_URL') ?? 'http://localhost:3000').replace(/\/$/, '');
  return <div className="flex min-h-screen flex-col"><ProductJsonLd product={product} reviews={reviewData?.reviews} /><BreadcrumbJsonLd base={base} items={[{ name: t('shop'), path: `/${locale}/${city}` }, { name: t('collectionTitle'), path: shopHref }, { name: product.name }]} /><SiteHeader /><main className="mx-auto w-[min(calc(100%-3rem),80rem)] py-12 pb-24 max-md:w-[min(calc(100%-2rem),80rem)] max-md:pt-4"><Link className="text-sm text-primary underline underline-offset-4" href={shopHref}>← {t('backCollection')}</Link><ProductDetail product={product} /><ProductReviews productSlug={product.slug} locale={locale} data={reviewData} /></main><SiteFooter locale={locale} city={city} /></div>;
}
