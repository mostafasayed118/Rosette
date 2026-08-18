import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { LocalizedPageHeading } from '@/features/i18n/LocalizedPageHeading';
import { getBlogRepository } from '@/features/blog/provider';
import { estimateReadingTime } from '@/features/blog/reading-time';
import { localizedExcerpt, localizedTitle } from '@/features/blog/localized';
import { getCityBySlug } from '@/features/destination/data';
import { pickLocalized } from '@/features/i18n/pick';
import { buildLocalizedPageMetadata } from '@/features/seo/page-metadata';
import { getServerT } from '@/features/i18n/server';
import { getOptionalServerEnv } from '@/lib/server-env';
import { LOCALES } from '@/lib/locale-routing';
import type { Locale } from '@/features/i18n/types';

type BlogPageParams = { params: Promise<{ locale: string; city: string }> };

export async function generateMetadata({ params }: BlogPageParams): Promise<Metadata> {
  const { locale, city } = await params;
  const { t } = await getServerT();
  const base = (getOptionalServerEnv('SITE_URL') ?? 'https://rosette.fly.dev').replace(/\/$/, '');
  const resolvedLocale: Locale = (LOCALES as string[]).includes(locale) ? (locale as Locale) : 'en';
  return buildLocalizedPageMetadata({ locale: resolvedLocale, city, path: '/blog', base, title: t('blogTitle'), description: t('blogLede') });
}

export default async function BlogPage({ params }: BlogPageParams) {
  const { locale: localeRaw, city: citySlug } = await params;
  const { t } = await getServerT();
  const locale: Locale = (LOCALES as string[]).includes(localeRaw) ? (localeRaw as Locale) : 'en';
  const city = getCityBySlug(citySlug);
  const cityName = city ? pickLocalized(locale, { en: city.name, ar: city.nameAr, fr: city.nameFr }) : undefined;
  const posts = await getBlogRepository().listPublished({ type: 'post' });
  return <div className="flex min-h-screen flex-col"><SiteHeader /><main className="mx-auto w-[min(calc(100%-3rem),80rem)] py-12 pb-24 max-md:w-[min(calc(100%-2rem),80rem)] max-md:pt-4"><LocalizedPageHeading eyebrow="blogEyebrow" title="blogTitle" lede="blogLede" /><div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3"><Link className="group flex flex-col rounded-2xl border border-border p-6 transition-colors hover:border-primary" href={`/${locale}/${citySlug}/delivery`}><span className="text-xs font-bold uppercase tracking-[.16em] text-sage">{t('blogDeliveryCity')}</span><span className="mt-2 font-display text-2xl leading-tight text-foreground group-hover:text-primary">{t('blogDeliveryTitle', { city: cityName ?? citySlug })}</span><span className="mt-2 text-sm text-muted-foreground">{t('blogDeliveryLede')}</span></Link>{posts.map((post) => { const excerpt = localizedExcerpt(post, locale); const minutes = estimateReadingTime(excerpt); return <Link className="group flex flex-col rounded-2xl border border-border p-6 transition-colors hover:border-primary" href={`/${locale}/${citySlug}/blog/${post.slug}`} key={post.id}><span className="text-xs font-bold uppercase tracking-[.16em] text-sage">{post.category ? t(`blogCategory_${post.category}`) : t('blogCategory_guides')} · {t('minRead', { count: minutes })}</span><span className="mt-2 font-display text-2xl leading-tight text-foreground group-hover:text-primary">{localizedTitle(post, locale)}</span><span className="mt-2 line-clamp-3 text-sm text-muted-foreground">{excerpt}</span></Link>; })}</div></main><SiteFooter locale={locale} city={citySlug} /></div>;
}
