'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Boxes, Home, Package, ShoppingCart, Truck, type LucideIcon } from 'lucide-react';
import { Sidebar, SidebarContent, SidebarGroup, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';

const ICONS: Record<string, LucideIcon> = {
  '/admin': Home,
  '/admin/orders': ShoppingCart,
  '/admin/products': Package,
  '/admin/inventory': Boxes,
  '/admin/delivery': Truck,
};

export function AppSidebar({ items }: { items: { href: string; label: string }[] }) {
  const pathname = usePathname();
  return (
    <Sidebar>
      <SidebarHeader><span className="px-2 font-display text-2xl tracking-tight text-primary">Rosette</span></SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            {items.map(({ href, label }) => {
              const Icon = ICONS[href] ?? Home;
              return (
                <SidebarMenuItem key={href}>
                  <SidebarMenuButton asChild isActive={href === '/admin' ? pathname === '/admin' : pathname.startsWith(href)}>
                    <Link href={href}><Icon /><span>{label}</span></Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
