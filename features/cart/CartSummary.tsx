'use client';

import { useI18n } from '@/features/i18n/I18nProvider';
import { formatMoney } from '@/features/money';
import type { OrderTotals } from './types';

export function CartSummary({ totals }: { totals: OrderTotals }) {
  const { locale, t } = useI18n();
  return <dl className="mb-6">
    <div className="flex justify-between gap-4 py-2"><dt>{t('subtotal')}</dt><dd>{formatMoney(totals.subtotal, locale)}</dd></div>
    <div className="flex justify-between gap-4 py-2"><dt>{t('delivery')}</dt><dd>{formatMoney(totals.deliveryFee, locale)}</dd></div>
    <div className="mt-3 flex justify-between gap-4 border-t pt-4 font-bold text-primary"><dt>{t('total')}</dt><dd>{formatMoney(totals.total, locale)}</dd></div>
  </dl>;
}
