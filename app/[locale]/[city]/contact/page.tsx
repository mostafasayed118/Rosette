import Link from 'next/link';
import { MessageCircle } from 'lucide-react';
import { StaticPageShell } from '@/components/support/StaticPageShell';
import { getCityBySlug } from '@/features/destination/data';
import { getServerT } from '@/features/i18n/server';
import { getOptionalServerEnv } from '@/lib/server-env';

export default async function ContactPage({ params }: { params: Promise<{ locale: string; city: string }> }) {
  const { locale, city } = await params;
  const { t } = await getServerT(locale);
  const whatsapp = getOptionalServerEnv('WHATSAPP_BUSINESS_NUMBER');
  const whatsappDigits = whatsapp?.replace(/\D/g, '');
  return (
    <StaticPageShell locale={locale} city={getCityBySlug(city)?.slug ?? city} eyebrow={t('footerContactUs')} title={t('contactTitle')} lede={t('contactLede')}>
      <p>{t('contactHours')}</p>
      <div className="mt-6 flex flex-col gap-3">
        {whatsappDigits ? (
          <Link href={`https://wa.me/${whatsappDigits}`} className="inline-flex w-fit items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-on-primary transition-colors hover:bg-on-primary-fixed-variant">
            <MessageCircle className="h-4 w-4" aria-hidden="true" /> {t('contactWhatsapp')}
          </Link>
        ) : null}
      </div>
    </StaticPageShell>
  );
}
