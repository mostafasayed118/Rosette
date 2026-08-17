'use client';

import Link from 'next/link';
import { StatusMessage } from '@/components/ui/StatusMessage';
import { useI18n } from '@/features/i18n/I18nProvider';
import { useCart } from './CartProvider';
import { CartLineItem } from './CartLineItem';
import { CartSummary } from './CartSummary';

export function CartPageContent() { const { t } = useI18n(); const { cart, ready, totals, updateQuantity, removeItem } = useCart(); if (!ready) return <div className="status-message"><strong>{t('openingBag')}</strong></div>; if (!cart.lines.length) return <StatusMessage title={t('bagWaiting')}><Link className="button" href="/shop">{t('browseCollection')} ↗</Link></StatusMessage>; return <div className="cart-layout"><div className="cart-lines">{cart.lines.map((line) => <CartLineItem key={line.id} line={line} onQuantityChange={(quantity) => updateQuantity(line.id, quantity)} onRemove={() => removeItem(line.id)} />)}</div><aside className="cart-aside"><CartSummary totals={totals} /><Link className="button" href="/checkout">{t('checkout')} ↗</Link><p className="demo-disclosure">{t('demoCheckout')}</p></aside></div>; }
