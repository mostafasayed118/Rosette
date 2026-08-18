import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { getBlogRepository } from '@/features/blog/provider';
import { getCityBySlug } from '@/features/destination/data';
import { getServerT } from '@/features/i18n/server';
import { pickLocalized } from '@/features/i18n/pick';
import { buildLocalizedPageMetadata } from '@/features/seo/page-metadata';
import { getOptionalServerEnv } from '@/lib/server-env';
import { LOCALES } from '@/lib/locale-routing';
import type { Locale } from '@/features/i18n/types';

type DeliveryPageParams = { params: Promise<{ locale: string; city: string }> };

export async function generateMetadata({ params }: DeliveryPageParams): Promise<Metadata> {
  const { locale, city } = await params;
  const { t } = await getServerT();
  const base = (getOptionalServerEnv('SITE_URL') ?? 'https://rosette.fly.dev').replace(/\/$/, '');
  const resolvedLocale: Locale = (LOCALES as string[]).includes(locale) ? (locale as Locale) : 'en';
  const cityRow = getCityBySlug(city);
  const cityName = cityRow ? pickLocalized(resolvedLocale, { en: cityRow.name, ar: cityRow.nameAr, fr: cityRow.nameFr }) : city;
  return buildLocalizedPageMetadata({ locale: resolvedLocale, city, path: '/delivery', base, title: t('blogDeliveryTitle', { city: cityName }), description: t('blogDeliveryLede') });
}

export default async function DeliveryPage({ params }: DeliveryPageParams) {
  const { locale: localeRaw, city: citySlug } = await params;
  const { t } = await getServerT();
  const locale: Locale = (LOCALES as string[]).includes(localeRaw) ? (localeRaw as Locale) : 'en';
  const cityRow = getCityBySlug(citySlug);
  const cityName = cityRow ? pickLocalized(locale, { en: cityRow.name, ar: cityRow.nameAr, fr: cityRow.nameFr }) : citySlug;
  const authored = cityRow ? (await getBlogRepository().listPublished({ type: 'city', cityCode: cityRow.code }))[0] ?? null : null;
  const full = authored ? await getBlogRepository().getBySlug(authored.slug) : null;
  const heading = full ? pickLocalized(locale, { en: full.titleEn, ar: full.titleAr ?? full.titleEn, fr: full.titleFr ?? full.titleEn }) : t('blogDeliveryTitle', { city: cityName });
  const lede = full ? (pickLocalized(locale, { en: full.excerptEn ?? '', ar: full.excerptAr ?? full.excerptEn ?? '', fr: full.excerptFr ?? full.excerptEn ?? '' }) || t('blogDeliveryLede')) : t('blogDeliveryLede');
  const body = full ? pickLocalized(locale, { en: full.contentEn, ar: full.contentAr ?? full.contentEn, fr: full.contentFr ?? full.contentEn }) : `<p>${cityRow?.sameDay ? t('deliveryDefaultSameDay', { city: cityName }) : t('deliveryDefaultNextDay', { city: cityName })}</p>`;
  return <div className="flex min-h-screen flex-col"><SiteHeader /><main className="mx-auto w-[min(calc(100%-3rem),50rem)] py-12 pb-24 max-md:w-[min(calc(100%-2rem),50rem)] max-md:pt-4"><p className="text-xs font-bold uppercase tracking-[.16em] text-sage">{t('blogDeliveryCity')}</p><h1 className="mt-2 font-display text-[clamp(2.25rem,5vw,3.5rem)] leading-[.98] tracking-[-.04em] text-primary">{heading}</h1><p className="mt-4 text-lg text-muted-foreground">{lede}</p><div className="mt-8 space-y-4 text-[1.05rem] leading-relaxed text-foreground [&_ul]:list-disc [&_ul]:pl-5 [&_li]:mt-1" dangerouslySetInnerHTML={{ __html: body }} /><Link className="mt-10 inline-block text-sm text-primary underline underline-offset-4" href={`/${locale}/${citySlug}/shop`}>{t('browseCollection')} ↗</Link></main><SiteFooter locale={locale} city={citySlug} /></div>;
}
