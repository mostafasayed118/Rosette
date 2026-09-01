import type { ReactNode } from 'react';
import { SidebarInset, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/admin/AppSidebar';
import { Button } from '@/components/ui/button';
import { signOut } from '@/features/auth/actions';
import { getAdminServerT } from '@/features/i18n/admin-server';
import { AdminLanguageToggle } from '@/components/admin/AdminLanguageToggle';
import { AdminThemeToggle } from '@/components/admin/AdminThemeToggle';
import { AdminBreadcrumbs } from '@/components/admin/AdminBreadcrumbs';
import { AdminCommandPalette } from '@/components/admin/AdminCommandPalette';
import { getAdminSupabase } from '@/lib/supabase/admin';

const NAV_ITEMS = [
  { href: '/admin', key: 'adminDashboard' },
  { href: '/admin/orders', key: 'orders' },
  { href: '/admin/cancel-requests', key: 'cancelRequests' },
  { href: '/admin/change-requests', key: 'changeRequests' },
  { href: '/admin/reviews', key: 'reviews' },
  { href: '/admin/products', key: 'products' },
  { href: '/admin/inventory', key: 'inventory' },
  { href: '/admin/delivery', key: 'deliveryRules' },
  { href: '/admin/promos', key: 'promos' },
  { href: '/admin/gift-cards', key: 'giftCards' },
  { href: '/admin/subscriptions', key: 'subscriptionsTitle' },
  { href: '/admin/blog', key: 'blogTitle' },
  { href: '/admin/authors', key: 'authors' },
  { href: '/admin/notifications', key: 'notifications' },
  { href: '/admin/audit-log', key: 'auditLog' },
] as const;

const GROUP_LABEL_KEYS: Record<string, string> = {
  fulfillment: 'navGroupFulfillment',
  catalog: 'navGroupCatalog',
  ops: 'navGroupOps',
};

const GROUPED: Record<string, typeof NAV_ITEMS[number]['href'][]> = {
  fulfillment: ['/admin/orders', '/admin/cancel-requests', '/admin/change-requests', '/admin/reviews', '/admin/inventory', '/admin/delivery'],
  catalog: ['/admin/products', '/admin/promos', '/admin/gift-cards', '/admin/subscriptions', '/admin/blog', '/admin/authors'],
  ops: ['/admin/notifications', '/admin/audit-log'],
};

async function getNavBadges(): Promise<Record<string, number>> {
  try {
    const supabase = getAdminSupabase();
    const [orders, cancelPending, changePending, reviewsPending, notifications] = await Promise.all([
      supabase.from('orders').select('id', { count: 'exact', head: true }).neq('fulfillment_status', 'delivered').neq('fulfillment_status', 'cancelled').eq('payment_status', 'paid'),
      supabase.from('order_cancel_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('order_change_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('product_reviews').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('notification_deliveries').select('id', { count: 'exact', head: true }).in('status', ['pending', 'failed']).gte('attempts', 1),
    ]);
    return {
      '/admin/orders': orders.count ?? 0,
      '/admin/cancel-requests': cancelPending.count ?? 0,
      '/admin/change-requests': changePending.count ?? 0,
      '/admin/reviews': reviewsPending.count ?? 0,
      '/admin/notifications': notifications.count ?? 0,
    };
  } catch {
    return {};
  }
}

export async function AdminShell({ children }: { children: ReactNode }) {
  const [{ t }, badges] = await Promise.all([getAdminServerT(), getNavBadges()]);
  const labelByHref = new Map(NAV_ITEMS.map((it) => [it.href, t(it.key)]));
  const badgeByHref = badges;

  const sections = [
    {
      label: '',
      items: [{ href: '/admin' as const, label: labelByHref.get('/admin') ?? 'Dashboard', badge: undefined as number | undefined }],
    },
    {
      label: t(GROUP_LABEL_KEYS.fulfillment!),
      items: (GROUPED.fulfillment ?? []).map((href) => ({ href, label: labelByHref.get(href) ?? href, badge: badgeByHref[href] })),
    },
    {
      label: t(GROUP_LABEL_KEYS.catalog!),
      items: (GROUPED.catalog ?? []).map((href) => ({ href, label: labelByHref.get(href) ?? href, badge: badgeByHref[href] })),
    },
    {
      label: t(GROUP_LABEL_KEYS.ops!),
      items: (GROUPED.ops ?? []).map((href) => ({ href, label: labelByHref.get(href) ?? href, badge: badgeByHref[href] })),
    },
  ];

  // Flat items for command palette + backwards compat
  const flatItems = NAV_ITEMS.map((item) => ({ href: item.href, label: labelByHref.get(item.href) ?? item.key }));

  return (
    <>
      <AppSidebar items={flatItems} sections={sections} />
      <SidebarInset>
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b bg-background px-4">
          <SidebarTrigger className="-ms-2" />
          <span className="font-display text-lg text-primary md:hidden">Rosette</span>
          <div className="hidden md:block">
            <AdminBreadcrumbs />
          </div>
          <div className="ms-auto flex items-center gap-2">
            <AdminCommandPalette items={flatItems} />
            <AdminThemeToggle />
            <AdminLanguageToggle />
            <form action={signOut}><Button variant="outline" size="sm" type="submit">{t('signOut')}</Button></form>
          </div>
        </header>
        <main id="main-content" className="mx-auto flex w-full max-w-[88rem] flex-1 flex-col gap-6 p-4 md:p-8">{children}</main>
      </SidebarInset>
    </>
  );
}
