'use client';

import { useI18n } from '@/features/i18n/I18nProvider';
import { createWhatsAppHref } from '@/features/support/whatsapp';

export function WhatsAppButton({ number, orderId }: { number?: string; orderId?: string }) {
  const { locale, t } = useI18n();
  if (!number) return null;
  const href = createWhatsAppHref({ number, locale, orderId });
  if (!href) return null;
  return <a className="button button-secondary" href={href} target="_blank" rel="noreferrer">{t('whatsappChat')} ↗</a>;
}
