'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { StatusMessage } from '@/components/ui/status-message';
import { useI18n } from '@/features/i18n/I18nProvider';
import { useDeliveryFee } from '@/features/delivery/useDeliveryFee';
import { estimateDeliveryFeeMinor } from '@/features/destination/delivery-fee';
import { readDestination } from '@/features/destination/storage';
import { useCart } from './CartProvider';
import { CartLineItem } from './CartLineItem';
import { CartSummary } from './CartSummary';
import { calculateCartTotals } from './pricing';

export function CartPageContent() {
  const { t } = useI18n();
  const { cart, ready, updateQuantity, removeItem } = useCart();
  const cityCode = readDestination()?.cityCode;
  const { feeMinor } = useDeliveryFee(cityCode);
  const deliveryFee = feeMinor ?? estimateDeliveryFeeMinor(cityCode) ?? 1500;
  const totals = calculateCartTotals(cart.lines, cart.lines.length ? deliveryFee : 0);
  if (!ready) return <StatusMessage title={t('openingBag')} />;
  if (!cart.lines.length) return <StatusMessage title={t('bagWaiting')}><Button asChild><Link href="/shop">{t('browseCollection')} ↗</Link></Button></StatusMessage>;
  return <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(260px,0.6fr)] gap-16 pt-8 max-md:grid-cols-1"><div className="grid gap-4">{cart.lines.map((line) => <CartLineItem key={line.id} line={line} onQuantityChange={(quantity) => updateQuantity(line.id, quantity)} onRemove={() => removeItem(line.id)} />)}</div><aside className="sticky top-4 self-start rounded-2xl border bg-card p-6 shadow-sm max-md:static"><CartSummary totals={totals} /><Button asChild><Link href="/checkout">{t('checkout')} ↗</Link></Button><p className="mt-2 text-xs text-muted-foreground">{t('demoCheckout')}</p></aside></div>;
}
