'use client';

import { useI18n } from '@/features/i18n/I18nProvider';
import type { OrderTotals } from './types';

export function formatMoney(minorUnits: number, locale = 'en') { return new Intl.NumberFormat(locale === 'ar' ? 'ar-EG' : 'en-EG', { style: 'currency', currency: 'EGP', maximumFractionDigits: 0 }).format(minorUnits / 100); }
export function CartSummary({ totals }: { totals: OrderTotals }) { const { locale, t } = useI18n(); return <dl className="cart-summary"><div><dt>{t('subtotal')}</dt><dd>{formatMoney(totals.subtotal, locale)}</dd></div><div><dt>{t('delivery')}</dt><dd>{formatMoney(totals.deliveryFee, locale)}</dd></div><div className="summary-total"><dt>{t('total')}</dt><dd>{formatMoney(totals.total, locale)}</dd></div></dl>; }
