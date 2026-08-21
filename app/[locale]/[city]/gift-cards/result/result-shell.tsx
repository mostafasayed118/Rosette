'use client';

import type { ReactNode } from 'react';
import { useI18n } from '@/features/i18n/I18nProvider';

export function GiftCardResultShell({ children }: { locale: string; city: string; cityCode: string; children: ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="grid max-w-[640px] mx-auto gap-8">
      <div className="text-center grid gap-4">
        <p className="font-mono text-[14px] leading-none tracking-[0.05em] uppercase text-on-surface-variant">{t('giftCardsEyebrow')}</p>
        <h1 className="font-display text-[42px] md:text-[48px] leading-[1.1] tracking-[-0.02em] font-semibold text-on-surface">{t('giftCardResultTitle')}</h1>
        <p className="font-body text-[18px] leading-[1.6] text-on-surface-variant max-w-[42rem] mx-auto">{t('giftCardResultLede')}</p>
      </div>
      <div className="grid gap-6">{children}</div>
    </div>
  );
}
