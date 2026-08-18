'use client';

import { useCart } from '@/features/cart/CartProvider';
import { CartSummary } from '@/features/cart/CartSummary';
import { calculateCartTotals } from '@/features/cart/pricing';
import { useDeliveryFee } from '@/features/delivery/useDeliveryFee';
import { estimateDeliveryFeeMinor } from '@/features/destination/delivery-fee';
import { readDestination } from '@/features/destination/storage';
import { useI18n } from '@/features/i18n/I18nProvider';
import { usePromoCode } from '@/features/promo/usePromoCode';
import { CheckoutForm } from './CheckoutForm';

export function CheckoutPageContent() {
  const { t } = useI18n();
  const { cart } = useCart();
  const cityCode = readDestination()?.cityCode ?? 'alexandria';
  const { feeMinor } = useDeliveryFee(cityCode);
  const deliveryFee = feeMinor ?? estimateDeliveryFeeMinor(cityCode) ?? 1500;
  const subtotal = calculateCartTotals(cart.lines, 0).subtotal;
  const promo = usePromoCode(subtotal);
  const promoDiscount = promo.discountMinor ?? 0;
  const liveTotal = calculateCartTotals(cart.lines, cart.lines.length ? deliveryFee : 0).total;

  return <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(260px,0.6fr)] gap-16 pt-8 max-md:grid-cols-1">
    <CheckoutForm promo={promo} promoDiscount={promoDiscount} />
    <aside className="sticky top-4 self-start rounded-2xl border bg-card p-6 shadow-sm max-md:static">
      <p className="text-xs font-bold uppercase tracking-[.16em] text-sage">{t('yourOrder')}</p>
      <CartSummary totals={{ subtotal, deliveryFee, discountMinor: promoDiscount || undefined, total: Math.max(0, liveTotal - promoDiscount) }} />
      {promo.state === 'valid' ? <p className="text-xs text-success">{t('promoApplied')} — {promo.code}</p> : null}
    </aside>
  </div>;
}
