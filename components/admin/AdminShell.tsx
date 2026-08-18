import Link from 'next/link';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { signOut } from '@/features/auth/actions';
import { getServerT } from '@/features/i18n/server';

const NAV_ITEMS = [
  { href: '/admin', key: 'adminDashboard' },
  { href: '/admin/orders', key: 'orders' },
  { href: '/admin/products', key: 'products' },
  { href: '/admin/inventory', key: 'inventory' },
  { href: '/admin/delivery', key: 'deliveryRules' },
  { href: '/admin/promos', key: 'promos' },
] as const;

export async function AdminShell({ children }: { children: ReactNode }) {
  const { t } = await getServerT();
  return <div className="admin-shell">
    <aside className="admin-sidebar">
      <span className="brand-mark">Rosette</span>
      <nav aria-label="Admin navigation">
        {NAV_ITEMS.map((item) => <Link key={item.href} href={item.href} className="admin-nav-link">{t(item.key)}</Link>)}
      </nav>
      <form action={signOut}><Button type="submit">{t('signOut')}</Button></form>
    </aside>
    <main className="admin-content">{children}</main>
  </div>;
}
