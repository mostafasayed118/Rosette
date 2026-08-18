'use client';

import Link from 'next/link';
import { Menu, Moon, Sun } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { useCart } from '@/features/cart/CartProvider';
import { LanguageToggle } from './LanguageToggle';
import { AccountNavItem } from './AccountNavItem';
import { useI18n } from '@/features/i18n/I18nProvider';
import { useStorePath } from '@/features/i18n/use-store-path';
import { useTheme } from '@/features/theme/ThemeProvider';

type SiteHeaderProps = { cityName?: string; cartCount?: number };

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return (
    <button type="button" className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-accent" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label="Toggle theme">
      {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </button>
  );
}

export function SiteHeader({ cityName, cartCount }: SiteHeaderProps) {
  const cart = useCart();
  const { t } = useI18n();
  const { locale, href } = useStorePath();
  const count = cartCount ?? (cart.ready ? cart.itemCount : 0);
  const bag = (
    <Link className="flex items-center gap-2" href={href('/cart')}>{t('bag')} <span className="grid h-6 min-w-6 place-items-center rounded-full bg-primary px-1.5 text-xs text-primary-foreground">{count}</span></Link>
  );
  return (
    <header className="mx-auto flex w-[min(calc(100%-3rem),80rem)] items-center justify-between gap-4 py-5">
      <Link className="font-display text-3xl tracking-tight text-primary" href={href('/')}>Rosette</Link>
      <nav className="hidden items-center gap-5 text-sm md:flex" aria-label="Main navigation">
        <Link href={href('/shop')}>{t('shop')}</Link>
        <Link href={href('/track')}>{t('trackOrder')}</Link>
        <AccountNavItem />
        <Link className="text-sm text-muted-foreground" href={`/${locale}`}>{cityName ? t('deliveringTo', { city: cityName }) : t('chooseDestination')}</Link>
        {bag}
        <LanguageToggle />
        <ThemeToggle />
      </nav>
      <div className="flex items-center gap-2 md:hidden">
        {bag}
        <Sheet>
          <SheetTrigger asChild>
            <button type="button" className="grid h-11 w-11 place-items-center rounded-full text-foreground hover:bg-accent" aria-label={t('menu')}><Menu className="h-5 w-5" /></button>
          </SheetTrigger>
          <SheetContent side="right">
            <SheetHeader><SheetTitle>{t('menu')}</SheetTitle></SheetHeader>
            <nav className="grid gap-1 p-4" aria-label="Mobile navigation">
              <Link className="rounded-xl px-4 py-3 hover:bg-accent" href={href('/shop')}>{t('shop')}</Link>
              <Link className="rounded-xl px-4 py-3 hover:bg-accent" href={href('/track')}>{t('trackOrder')}</Link>
              <div className="rounded-xl px-4 py-3 hover:bg-accent"><AccountNavItem /></div>
              <Link className="rounded-xl px-4 py-3 text-left hover:bg-accent" href={`/${locale}`}>{cityName ? t('deliveringTo', { city: cityName }) : t('chooseDestination')}</Link>
              <div className="flex items-center justify-between rounded-xl px-2 py-2"><LanguageToggle /><ThemeToggle /></div>
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
