'use client';

import { useI18n } from '@/features/i18n/I18nProvider';
import { formatMoney } from '@/features/money';
import type { OrderTotals } from './types';

export { formatMoney } from '@/features/money';
export function CartSummary({ totals }: { totals: OrderTotals }) { const { locale, t } = useI18n(); return <dl className="cart-summary"><div><dt>{t('subtotal')}</dt><dd>{formatMoney(totals.subtotal, locale)}</dd></div><div><dt>{t('delivery')}</dt><dd>{formatMoney(totals.deliveryFee, locale)}</dd></div><div className="summary-total"><dt>{t('total')}</dt><dd>{formatMoney(totals.total, locale)}</dd></div></dl>; }
