import type { Metadata } from 'next';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { buildLocalizedPageMetadata } from '@/features/seo/page-metadata';
import { getServerT } from '@/features/i18n/server';
import { getOptionalServerEnv } from '@/lib/server-env';
import { LOCALES } from '@/lib/locale-routing';
import { GiftFinderQuiz } from '@/features/gift-finder/GiftFinderQuiz';
import type { Locale } from '@/features/i18n/types';

type PageParams = { params: Promise<{ locale: string; city: string }> };

export async function generateMetadata({ params }: PageParams): Promise<Metadata> {
  const { locale, city } = await params;
  const resolvedLocale: Locale = (LOCALES as string[]).includes(locale) ? (locale as Locale) : 'en';
  const { t } = await getServerT(resolvedLocale);
  const base = (getOptionalServerEnv('SITE_URL') ?? 'http://localhost:3000').replace(/\/$/, '');
  return buildLocalizedPageMetadata({ locale: resolvedLocale, city, path: '/gift-finder', base, title: t('giftFinderTitle'), description: t('giftFinderLede') });
}

export default async function GiftFinderPage({ params }: PageParams) {
  const { locale, city } = await params;
  const resolvedLocale: Locale = (LOCALES as string[]).includes(locale) ? (locale as Locale) : 'en';
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main id="main-content" className="flex-grow"><GiftFinderQuiz /></main>
      <SiteFooter locale={resolvedLocale} city={city} />
    </div>
  );
}
