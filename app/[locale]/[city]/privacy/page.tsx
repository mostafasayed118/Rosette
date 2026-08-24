import { StaticPageShell } from '@/components/support/StaticPageShell';
import { getCityBySlug } from '@/features/destination/data';
import { getServerT } from '@/features/i18n/server';

export default async function PrivacyPage({ params }: { params: Promise<{ locale: string; city: string }> }) {
  const { locale, city } = await params;
  const { t } = await getServerT(locale);
  return (
    <StaticPageShell locale={locale} city={getCityBySlug(city)?.slug ?? city} eyebrow={t('footerPrivacy')} title={t('privacyTitle')} lede={t('privacyLede')}>
      <p>{t('privacyBody')}</p>
    </StaticPageShell>
  );
}
