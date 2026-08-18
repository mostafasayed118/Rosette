'use client';

import Link from 'next/link';
import { useCart } from '@/features/cart/CartProvider';
import { LanguageToggle } from './LanguageToggle';
import { useI18n } from '@/features/i18n/I18nProvider';

type SiteHeaderProps = { cityName?: string; cartCount?: number; onDestinationChange?: () => void };

export function SiteHeader({ cityName, cartCount, onDestinationChange }: SiteHeaderProps) {
  const cart = useCart();
  const { t } = useI18n();
  const count = cartCount ?? (cart.ready ? cart.itemCount : 0);
  return <header className="site-header"><Link className="brand-mark" href="/">Rosette</Link><nav aria-label="Main navigation"><Link href="/shop">{t('shop')}</Link><Link href="/track">{t('trackOrder')}</Link><button className="header-destination" type="button" onClick={onDestinationChange}>{cityName ? t('deliveringTo', { city: cityName }) : t('chooseDestination')}</button><Link className="cart-link" href="/cart">{t('bag')} <span>{count}</span></Link><LanguageToggle /></nav></header>;
}
