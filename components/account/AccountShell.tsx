'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { useI18n } from '@/features/i18n/I18nProvider';
import { useStorePath } from '@/features/i18n/use-store-path';

export function AccountShell({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const { href } = useStorePath();
  const pathname = usePathname();
  const profile = href('/account');
  const orders = href('/account/orders');
  const active = (target: string) => (pathname === target || pathname.startsWith(`${target}/`) ? 'text-primary' : 'text-muted-foreground');
  return (
    <div className="mx-auto w-[min(calc(100%-3rem),80rem)] py-12 pb-24 max-md:w-[min(calc(100%-2rem),80rem)] max-md:pt-4">
      <p className="text-xs font-bold uppercase tracking-[.16em] text-sage">{t('account')}</p>
      <nav className="mt-3 flex gap-4 border-b text-sm">
        <Link className={`px-1 pb-2 ${active(profile)}`} href={profile}>{t('profile')}</Link>
        <Link className={`px-1 pb-2 ${active(orders)}`} href={orders}>{t('myOrders')}</Link>
      </nav>
      <div className="pt-8">{children}</div>
    </div>
  );
}
