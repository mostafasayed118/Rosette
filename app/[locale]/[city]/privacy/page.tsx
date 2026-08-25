import type { Metadata } from 'next';
import { StaticPageShell } from '@/components/support/StaticPageShell';
import { getCityBySlug } from '@/features/destination/data';
import { getServerT } from '@/features/i18n/server';
import { buildLocalizedPageMetadata } from '@/features/seo/page-metadata';
import { getOptionalServerEnv } from '@/lib/server-env';
import { LOCALES } from '@/lib/locale-routing';
import type { Locale } from '@/features/i18n/types';

type PrivacyPageParams = { params: Promise<{ locale: string; city: string }> };

export async function generateMetadata({ params }: PrivacyPageParams): Promise<Metadata> {
  const { locale, city } = await params;
  const resolvedLocale: Locale = (LOCALES as string[]).includes(locale) ? (locale as Locale) : 'en';
  const { t } = await getServerT(resolvedLocale);
  const base = (getOptionalServerEnv('SITE_URL') ?? 'http://localhost:3000').replace(/\/$/, '');
  return buildLocalizedPageMetadata({ locale: resolvedLocale, city, path: '/privacy', base, title: t('privacyTitle'), description: t('privacyLede') });
}

export default async function PrivacyPage({ params }: PrivacyPageParams) {
  const { locale, city } = await params;
  const { t } = await getServerT(locale);
  return (
    <StaticPageShell locale={locale} city={getCityBySlug(city)?.slug ?? city} eyebrow={t('footerPrivacy')} title={t('privacyTitle')} lede={t('privacyLede')}>
      <p>{t('privacyBody')}</p>
    </StaticPageShell>
  );
}
