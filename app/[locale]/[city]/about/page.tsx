import { StaticPageShell } from '@/components/support/StaticPageShell';
import { getCityBySlug } from '@/features/destination/data';
import { getServerT } from '@/features/i18n/server';

export default async function AboutPage({ params }: { params: Promise<{ locale: string; city: string }> }) {
  const { locale, city } = await params;
  const { t } = await getServerT(locale);
  return (
    <StaticPageShell locale={locale} city={getCityBySlug(city)?.slug ?? city} eyebrow={t('footerOurStory')} title={t('aboutTitle')} lede={t('aboutLede')}>
      <p>{t('aboutBody')}</p>
    </StaticPageShell>
  );
}
