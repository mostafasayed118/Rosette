'use client';

import Link from 'next/link';
import { Moon, Sun } from 'lucide-react';
import { useCart } from '@/features/cart/CartProvider';
import { LanguageToggle } from './LanguageToggle';
import { useI18n } from '@/features/i18n/I18nProvider';
import { useTheme } from '@/features/theme/ThemeProvider';

type SiteHeaderProps = { cityName?: string; cartCount?: number; onDestinationChange?: () => void };

export function SiteHeader({ cityName, cartCount, onDestinationChange }: SiteHeaderProps) {
  const cart = useCart();
  const { t } = useI18n();
  const { theme, setTheme } = useTheme();
  const count = cartCount ?? (cart.ready ? cart.itemCount : 0);
  return <header className="mx-auto flex w-[min(calc(100%-3rem),80rem)] items-center justify-between gap-8 py-5 max-md:flex-wrap"><Link className="font-display text-3xl tracking-tight text-primary" href="/">Rosette</Link><nav className="flex items-center gap-5 text-sm" aria-label="Main navigation"><Link href="/shop">{t('shop')}</Link><Link href="/track">{t('trackOrder')}</Link><button className="bg-transparent p-0 text-sm text-muted-foreground" type="button" onClick={onDestinationChange}>{cityName ? t('deliveringTo', { city: cityName }) : t('chooseDestination')}</button><Link className="flex items-center gap-2" href="/cart">{t('bag')} <span className="grid h-6 min-w-6 place-items-center rounded-full bg-primary px-1.5 text-xs text-primary-foreground">{count}</span></Link><LanguageToggle /><button type="button" className="text-muted-foreground" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label="Toggle theme">{theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}</button></nav></header>;
}
