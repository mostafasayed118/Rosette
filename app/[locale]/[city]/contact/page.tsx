import type { Metadata } from 'next';
import Link from 'next/link';
import { Mail, MessageCircle } from 'lucide-react';
import { StaticPageShell } from '@/components/support/StaticPageShell';
import { getCityBySlug } from '@/features/destination/data';
import { getServerT } from '@/features/i18n/server';
import { buildLocalizedPageMetadata } from '@/features/seo/page-metadata';
import { getOptionalServerEnv } from '@/lib/server-env';
import { LOCALES } from '@/lib/locale-routing';
import type { Locale } from '@/features/i18n/types';

type ContactPageParams = { params: Promise<{ locale: string; city: string }> };

export async function generateMetadata({ params }: ContactPageParams): Promise<Metadata> {
  const { locale, city } = await params;
  const resolvedLocale: Locale = (LOCALES as string[]).includes(locale) ? (locale as Locale) : 'en';
  const { t } = await getServerT(resolvedLocale);
  const base = (getOptionalServerEnv('SITE_URL') ?? 'http://localhost:3000').replace(/\/$/, '');
  return buildLocalizedPageMetadata({ locale: resolvedLocale, city, path: '/contact', base, title: t('contactTitle'), description: t('contactLede') });
}

export default async function ContactPage({ params }: ContactPageParams) {
  const { locale, city } = await params;
  const { t } = await getServerT(locale);
  const whatsapp = getOptionalServerEnv('WHATSAPP_BUSINESS_NUMBER');
  const whatsappDigits = whatsapp?.replace(/\D/g, '');
  const email = getOptionalServerEnv('GMAIL_FROM');
  return (
    <StaticPageShell locale={locale} city={getCityBySlug(city)?.slug ?? city} eyebrow={t('footerContactUs')} title={t('contactTitle')} lede={t('contactLede')}>
      <p>{t('contactHours')}</p>
      <div className="mt-6 flex flex-col gap-3">
        {whatsappDigits ? (
          <Link href={`https://wa.me/${whatsappDigits}`} className="inline-flex w-fit items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-on-primary transition-colors hover:bg-on-primary-fixed-variant">
            <MessageCircle className="h-4 w-4" aria-hidden="true" /> {t('contactWhatsapp')}
          </Link>
        ) : null}
        {email ? (
          <Link href={`mailto:${email}`} className="inline-flex w-fit items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-on-primary transition-colors hover:bg-on-primary-fixed-variant">
            <Mail className="h-4 w-4" aria-hidden="true" /> {t('contactEmail')}
          </Link>
        ) : null}
      </div>
    </StaticPageShell>
  );
}
