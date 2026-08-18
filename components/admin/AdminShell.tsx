import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/admin/AppSidebar';
import { signOut } from '@/features/auth/actions';
import { getServerT } from '@/features/i18n/server';

const NAV_ITEMS = [
  { href: '/admin', key: 'adminDashboard' },
  { href: '/admin/orders', key: 'orders' },
  { href: '/admin/products', key: 'products' },
  { href: '/admin/inventory', key: 'inventory' },
  { href: '/admin/delivery', key: 'deliveryRules' },
  { href: '/admin/promos', key: 'promos' },
  { href: '/admin/blog', key: 'blogTitle' },
  { href: '/admin/notifications', key: 'notifications' },
] as const;

export async function AdminShell({ children }: { children: ReactNode }) {
  const { t } = await getServerT();
  const items = NAV_ITEMS.map((item) => ({ href: item.href, label: t(item.key) }));
  return (
    <SidebarProvider>
      <AppSidebar items={items} />
      <SidebarInset>
        <header className="flex h-14 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ms-2" />
          <span className="font-display text-lg text-primary max-md:block">Rosette</span>
          <form action={signOut} className="ms-auto"><Button variant="outline" size="sm" type="submit">{t('signOut')}</Button></form>
        </header>
        <main className="p-4 md:p-8">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
