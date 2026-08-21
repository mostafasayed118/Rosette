'use client';

import { useI18n } from '@/features/i18n/I18nProvider';
import { formatMoney } from '@/features/money';
import type { OrderTotals } from './types';

export function CartSummary({ totals, deliveryLabel }: { totals: OrderTotals; deliveryLabel?: string }) {
  const { locale, t } = useI18n();
  return (
    <dl className="space-y-3 font-body-md text-body-md text-on-surface-variant">
      <div className="flex justify-between gap-4">
        <dt>{t('subtotal')}</dt>
        <dd className="font-mono text-[14px] tracking-[0.05em] text-on-surface">{formatMoney(totals.subtotal, locale)}</dd>
      </div>
      {totals.discountMinor ? (
        <div className="flex justify-between gap-4 text-success">
          <dt>{t('discount')}</dt>
          <dd className="font-mono text-[14px] tracking-[0.05em]">−{formatMoney(totals.discountMinor, locale)}</dd>
        </div>
      ) : null}
      <div className="flex justify-between gap-4">
        <dt>{deliveryLabel ?? t('delivery')}</dt>
        <dd className="font-mono text-[14px] tracking-[0.05em] text-on-surface">{formatMoney(totals.deliveryFee, locale)}</dd>
      </div>
      <div className="pt-4 mt-2 border-t border-outline-variant/30 flex justify-between items-end gap-4">
        <dt className="text-[18px] font-medium text-on-surface">{t('total')}</dt>
        <dd className="font-mono text-[20px] font-bold tracking-[0.05em] text-primary">{formatMoney(totals.total, locale)}</dd>
      </div>
    </dl>
  );
}
