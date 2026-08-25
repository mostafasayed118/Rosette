'use client';

import Link from 'next/link';
import { useI18n } from '@/features/i18n/I18nProvider';
import { useStorePath } from '@/features/i18n/use-store-path';

export function SiteFooter({ locale = 'en', city = 'cairo' }: { locale?: string; city?: string }) {
  const { t, locale: activeLocale } = useI18n();
  const { href } = useStorePath();
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-outline-variant/30 bg-surface-container-low">
      <div className="mx-auto grid w-[min(calc(100%-3rem),80rem)] gap-10 py-12 text-sm md:grid-cols-[2fr_1fr_1fr] md:py-16">
        <div className="flex flex-col gap-2">
          <span className="font-display text-3xl tracking-tight text-primary">Rosette</span>
          <p className="max-w-[36ch] leading-relaxed text-on-surface-variant">{t('brandTagline')}</p>
          <p className={`mt-4 text-xs text-on-surface-variant ${activeLocale === 'ar' ? 'font-body tracking-normal' : 'font-mono tracking-[0.05em]'}`}>{t('footerCopyright', { year })}</p>
        </div>
        <nav className="flex flex-col gap-3" aria-label={t('navFooter')}>
          <Link className="text-on-surface-variant transition-colors hover:text-primary" href={`/${locale}`}>{t('footerCitySelector')}</Link>
          <Link className="text-on-surface-variant transition-colors hover:text-primary" href={href('/gift-cards')}>{t('footerGiftServices')}</Link>
          <Link className="text-on-surface-variant transition-colors hover:text-primary" href={href('/delivery')}>{t('footerShippingPolicy')}</Link>
          <Link className="text-on-surface-variant transition-colors hover:text-primary" href={href('/track')}>{t('trackOrder')}</Link>
        </nav>
        <nav className="flex flex-col gap-3" aria-label={t('navFooterCompany')}>
          <Link className="text-on-surface-variant transition-colors hover:text-primary" href={href('/about')}>{t('footerOurStory')}</Link>
          <Link className="text-on-surface-variant transition-colors hover:text-primary" href={href('/contact')}>{t('footerContactUs')}</Link>
          <Link className="text-on-surface-variant transition-colors hover:text-primary" href={href('/privacy')}>{t('footerPrivacy')}</Link>
        </nav>
      </div>
    </footer>
  );
}
