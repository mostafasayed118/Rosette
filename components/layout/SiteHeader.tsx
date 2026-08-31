'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, Moon, Sun } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { useCart } from '@/features/cart/CartProvider';
import { WishlistLink } from '@/components/wishlist/WishlistLink';
import { LanguageToggle } from './LanguageToggle';
import { AccountNavItem } from './AccountNavItem';
import { useI18n } from '@/features/i18n/I18nProvider';
import { useStorePath } from '@/features/i18n/use-store-path';
import { useTheme } from '@/features/theme/ThemeProvider';

type SiteHeaderProps = { cityName?: string; cartCount?: number };

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const { t } = useI18n();
  return (
    <button type="button" className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-accent" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label={t('toggleTheme')}>
      {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </button>
  );
}

export function SiteHeader({ cityName, cartCount }: SiteHeaderProps) {
  const cart = useCart();
  const { t } = useI18n();
  const { locale, href } = useStorePath();
  const pathname = usePathname();
  const count = cartCount ?? (cart.ready ? cart.itemCount : 0);

  const navItems = [
    { label: t('navGiftFinder'), path: '/gift-finder' },
    { label: t('navCollections'), path: '/shop' },
    { label: t('navBespoke'), path: '/shop?category=vase-arrangement' },
    { label: t('navAtelier'), path: '/blog' },
    { label: t('navGifts'), path: '/gift-cards' },
  ];

  function navClasses(path: string) {
    const base = href(path.split('?')[0] ?? path);
    const active = !path.includes('?') && (pathname === base || pathname.startsWith(`${base}/`));
    return `border-b-2 pb-1 transition-colors ${active ? 'border-primary text-primary' : 'border-transparent text-on-surface hover:text-primary'}`;
  }

  const bag = (
    <Link className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 px-1.5" href={href('/cart')}>{t('bag')} <span className="grid h-6 min-w-6 place-items-center rounded-full bg-primary px-1.5 font-mono text-xs text-primary-foreground">{count}</span></Link>
  );
  const wishlist = <WishlistLink />;

  return (
    <header className="sticky top-0 z-40 min-h-[var(--site-header-height)] border-b border-border/60 bg-background/85 backdrop-blur-md">
      <div className="site-container flex min-h-[var(--site-header-height)] items-center justify-between gap-3 py-3 md:py-4 lg:gap-6">
        <Link className="flex min-h-11 shrink-0 items-center font-display text-2xl tracking-tight text-primary md:text-3xl" href={href('/')}>Rosette</Link>
        {/* The full nav plus the utility cluster needs ~930px, so it only takes
            over from the drawer at the laptop breakpoint — not at md (768px),
            where it previously forced horizontal overflow on tablets. */}
        <nav className="hidden items-center gap-4 text-sm lg:flex xl:gap-7" aria-label={t('navPrimary')}>
          {navItems.map((item) => (
            <Link key={item.path} className={navClasses(item.path)} href={href(item.path)}>{item.label}</Link>
          ))}
        </nav>
        <div className="hidden items-center gap-2 text-sm lg:flex xl:gap-3">
          <Link className="max-w-[12rem] truncate text-xs text-muted-foreground hover:text-primary" href={`/${locale}`}>{cityName ? t('deliveringTo', { city: cityName }) : t('chooseDestination')}</Link>
          <AccountNavItem />
          {bag}
          {wishlist}
          <LanguageToggle />
          <ThemeToggle />
        </div>
        <div className="flex items-center gap-1 lg:hidden">
          {bag}
          {wishlist}
          <Sheet>
            <SheetTrigger asChild>
              <button type="button" className="grid h-11 w-11 place-items-center rounded-full text-foreground hover:bg-accent" aria-label={t('menu')}><Menu className="h-5 w-5" /></button>
            </SheetTrigger>
            <SheetContent side="right">
              <SheetHeader><SheetTitle>{t('menu')}</SheetTitle></SheetHeader>
              <nav className="grid gap-1 p-4" aria-label={t('navMobile')}>
                {navItems.map((item) => (
                  <Link key={item.path} className="rounded-xl px-4 py-3 hover:bg-accent" href={href(item.path)}>{item.label}</Link>
                ))}
                <div className="rounded-xl px-4 py-3 hover:bg-accent"><AccountNavItem /></div>
                <Link className="rounded-xl px-4 py-3 text-left hover:bg-accent" href={`/${locale}`}>{cityName ? t('deliveringTo', { city: cityName }) : t('chooseDestination')}</Link>
                <div className="flex items-center justify-between rounded-xl px-2 py-2"><LanguageToggle /><ThemeToggle /></div>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
