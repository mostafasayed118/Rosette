'use client';

import Link from 'next/link';
import { StatusMessage } from '@/components/ui/status-message';
import { useI18n } from '@/features/i18n/I18nProvider';
import { useDeliveryFee } from '@/features/delivery/useDeliveryFee';
import { estimateDeliveryFeeMinor } from '@/features/destination/delivery-fee';
import { readDestination } from '@/features/destination/storage';
import { useCart } from './CartProvider';
import { CartLineItem } from './CartLineItem';
import { CartSummary } from './CartSummary';
import { calculateCartTotals } from './pricing';

export function CartPageContent() { const { t } = useI18n(); const { cart, ready, updateQuantity, removeItem } = useCart(); const cityCode = readDestination()?.cityCode; const { feeMinor } = useDeliveryFee(cityCode); const deliveryFee = feeMinor ?? estimateDeliveryFeeMinor(cityCode) ?? 1500; const totals = calculateCartTotals(cart.lines, cart.lines.length ? deliveryFee : 0); if (!ready) return <div className="status-message"><strong>{t('openingBag')}</strong></div>; if (!cart.lines.length) return <StatusMessage title={t('bagWaiting')}><Link className="button" href="/shop">{t('browseCollection')} ↗</Link></StatusMessage>; return <div className="cart-layout"><div className="cart-lines">{cart.lines.map((line) => <CartLineItem key={line.id} line={line} onQuantityChange={(quantity) => updateQuantity(line.id, quantity)} onRemove={() => removeItem(line.id)} />)}</div><aside className="cart-aside"><CartSummary totals={totals} /><Link className="button" href="/checkout">{t('checkout')} ↗</Link><p className="demo-disclosure">{t('demoCheckout')}</p></aside></div>; }
