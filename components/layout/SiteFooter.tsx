'use client';

import { useI18n } from '@/features/i18n/I18nProvider';

export function SiteFooter() {
  const { t } = useI18n();
  return <footer className="site-footer"><div><span className="brand-mark">Rosette</span><p>{t('brandTagline')}</p><p>{t('photoCredit')}</p></div><div className="footer-links"><span>{t('footerDelivery')}</span><span>{t('footerNotes')}</span><span>{t('footerDemo')}</span></div></footer>;
}
