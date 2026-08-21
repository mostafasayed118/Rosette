'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { Heart, Mail, Package, Star, User } from 'lucide-react';
import { useI18n } from '@/features/i18n/I18nProvider';
import { useStorePath } from '@/features/i18n/use-store-path';

export function AccountShell({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const { href } = useStorePath();
  const pathname = usePathname();

  const profileHref = href('/account');
  const ordersHref = href('/account/orders');
  const wishlistHref = href('/wishlist');
  const reviewsHref = href('/account');
  const emailPrefsHref = href('/account');

  const isOrdersActive = pathname === ordersHref || pathname.startsWith(`${ordersHref}/`);
  const isWishlistActive = pathname === wishlistHref || pathname.startsWith(`${wishlistHref}/`);
  const isProfileActive = pathname === profileHref;

  function navClasses(active: boolean) {
    return active
      ? 'flex items-center gap-2 rounded-full bg-primary-container px-4 py-2.5 text-sm font-medium text-on-primary-container transition-colors'
      : 'flex items-center gap-2 rounded-full px-4 py-2.5 text-sm text-on-surface-variant transition-colors hover:bg-surface-container hover:text-primary';
  }

  return (
    <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-8 px-5 py-8 md:flex-row md:gap-16 md:px-16 md:py-16">
      <aside className="w-full shrink-0 md:w-64 md:border-r md:border-outline-variant/30 md:pr-6">
        <div className="border-b border-outline-variant/30 pb-6">
          <p className="font-display text-[1.5rem] font-medium leading-tight tracking-tight text-primary">{t('account')}</p>
        </div>
        <nav className="flex flex-row flex-wrap gap-1.5 pt-6 md:flex-col" aria-label="Account navigation">
          <Link className={navClasses(isOrdersActive)} href={ordersHref}>
            <Package className="h-4 w-4 shrink-0" aria-hidden />
            <span>{t('myOrders')}</span>
          </Link>
          <Link className={navClasses(isWishlistActive)} href={wishlistHref}>
            <Heart className="h-4 w-4 shrink-0" aria-hidden />
            <span>{t('wishlist')}</span>
          </Link>
          <Link className={navClasses(false)} href={reviewsHref}>
            <Star className="h-4 w-4 shrink-0" aria-hidden />
            <span>Reviews</span>
          </Link>
          <Link className={navClasses(isProfileActive)} href={emailPrefsHref} aria-current={isProfileActive ? 'page' : undefined}>
            <Mail className="h-4 w-4 shrink-0" aria-hidden />
            <span>{t('emailPreferences')}</span>
          </Link>
          <Link className={navClasses(isProfileActive)} href={profileHref} aria-current={isProfileActive ? 'page' : undefined}>
            <User className="h-4 w-4 shrink-0" aria-hidden />
            <span>{t('profile')}</span>
          </Link>
        </nav>
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
