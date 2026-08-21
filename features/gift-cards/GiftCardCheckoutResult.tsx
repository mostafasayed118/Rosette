'use client';

import Link from 'next/link';
import { CheckCircle2, Clock3, XCircle } from 'lucide-react';
import { StatusMessage } from '@/components/ui/status-message';
import { useI18n } from '@/features/i18n/I18nProvider';
import { useStorePath } from '@/features/i18n/use-store-path';

export function GiftCardCheckoutResult({ status }: { status: 'pending' | 'paid' | 'failed' }) {
  const { t } = useI18n();
  const { href } = useStorePath();

  if (status === 'paid')
    return (
      <div className="grid gap-4">
        <div className="rounded-xl border border-secondary-container bg-surface-container-low p-6 shadow-[0_24px_48px_-12px_rgba(119,113,104,0.08)] flex gap-4 items-start">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-secondary-container text-on-secondary-container">
            <CheckCircle2 className="h-5 w-5" />
          </span>
          <div>
            <strong className="font-display text-[18px] text-on-surface block">{t('giftCardPaid')}</strong>
            <p className="mt-1 text-sm text-on-surface-variant leading-relaxed">{t('giftCardDeliveryHint')}</p>
          </div>
        </div>
        <Link className="text-sm font-medium text-primary underline underline-offset-4 justify-self-center" href={href('/shop')}>
          {t('keepBrowsing')} ↗
        </Link>
      </div>
    );

  if (status === 'failed')
    return (
      <div className="grid gap-4">
        <div className="rounded-xl border border-error/20 bg-error-container/30 p-6 flex gap-4 items-start">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-error-container text-on-error-container">
            <XCircle className="h-5 w-5" />
          </span>
          <div>
            <strong className="font-display text-[18px] text-on-surface block">{t('giftCardPaymentFailed')}</strong>
            <p className="mt-1 text-sm text-on-surface-variant">{t('giftCardDeliveryPending')}</p>
          </div>
        </div>
        <Link className="text-sm font-medium text-primary underline underline-offset-4 justify-self-center" href={href('/shop')}>
          {t('keepBrowsing')} ↗
        </Link>
      </div>
    );

  return (
    <div className="grid gap-4">
      <div className="rounded-xl border border-outline-variant/50 bg-surface-container p-6 shadow-sm flex gap-4 items-start">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface-container-high text-on-surface-variant">
          <Clock3 className="h-5 w-5" />
        </span>
        <div>
          <strong className="font-display text-[18px] text-on-surface block">{t('giftCardPaymentPending')}</strong>
          <p className="mt-1 text-sm text-on-surface-variant leading-relaxed">{t('giftCardDeliveryPending')}</p>
        </div>
      </div>
      <Link className="text-sm font-medium text-primary underline underline-offset-4 justify-self-center" href={href('/')}>
        {t('keepBrowsing')} ↗
      </Link>
    </div>
  );
}
