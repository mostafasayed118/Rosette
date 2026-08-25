import type { Metadata } from 'next';
import { StaticPageShell } from '@/components/support/StaticPageShell';
import { getCityBySlug } from '@/features/destination/data';
import { getServerT } from '@/features/i18n/server';
import { buildLocalizedPageMetadata } from '@/features/seo/page-metadata';
import { getOptionalServerEnv } from '@/lib/server-env';
import { LOCALES } from '@/lib/locale-routing';
import type { Locale } from '@/features/i18n/types';

type AboutPageParams = { params: Promise<{ locale: string; city: string }> };

export async function generateMetadata({ params }: AboutPageParams): Promise<Metadata> {
  const { locale, city } = await params;
  const resolvedLocale: Locale = (LOCALES as string[]).includes(locale) ? (locale as Locale) : 'en';
  const { t } = await getServerT(resolvedLocale);
  const base = (getOptionalServerEnv('SITE_URL') ?? 'http://localhost:3000').replace(/\/$/, '');
  return buildLocalizedPageMetadata({ locale: resolvedLocale, city, path: '/about', base, title: t('aboutTitle'), description: t('aboutLede') });
}

export default async function AboutPage({ params }: AboutPageParams) {
  const { locale, city } = await params;
  const { t } = await getServerT(locale);
  return (
    <StaticPageShell locale={locale} city={getCityBySlug(city)?.slug ?? city} eyebrow={t('footerOurStory')} title={t('aboutTitle')} lede={t('aboutLede')}>
      <p>{t('aboutBody')}</p>
    </StaticPageShell>
  );
}
