'use client';

import { useI18n } from '@/features/i18n/I18nProvider';

export function SiteFooter() {
  const { t } = useI18n();
  return <footer className="mx-auto flex w-[min(calc(100%-3rem),80rem)] justify-between gap-8 border-t py-8 text-sm text-muted-foreground max-md:flex-col"><div><span className="font-display text-3xl tracking-tight text-primary">Rosette</span><p className="mt-1.5">{t('brandTagline')}</p><p>{t('photoCredit')}</p></div><div className="flex flex-wrap items-start gap-5"><span>{t('footerDelivery')}</span><span>{t('footerNotes')}</span><span>{t('footerDemo')}</span></div></footer>;
}
