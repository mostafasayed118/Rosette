'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Bell,
  BookOpen,
  Boxes,
  Gift,
  Home,
  Package,
  Pencil,
  ShoppingBag,
  Star,
  Ticket,
  Truck,
  Users,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';

const ICONS: Record<string, LucideIcon> = {
  '/admin': Home,
  '/admin/orders': ShoppingBag,
  '/admin/products': Package,
  '/admin/inventory': Boxes,
  '/admin/delivery': Truck,
  '/admin/promos': Ticket,
  '/admin/gift-cards': Gift,
  '/admin/blog': BookOpen,
  '/admin/authors': Users,
  '/admin/cancel-requests': XCircle,
  '/admin/change-requests': Pencil,
  '/admin/reviews': Star,
  '/admin/notifications': Bell,
};

export function AppSidebar({ items }: { items: { href: string; label: string }[] }) {
  const pathname = usePathname();
  return (
    <Sidebar>
      <SidebarHeader>
        <span className="px-2 font-display text-2xl tracking-tight text-primary">Rosette</span>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            {items.map(({ href, label }) => {
              const Icon = ICONS[href];
              if (!Icon) return null;
              return (
                <SidebarMenuItem key={href}>
                  <SidebarMenuButton
                    asChild
                    isActive={href === '/admin' ? pathname === '/admin' : pathname.startsWith(href)}
                  >
                    <Link href={href}>
                      <Icon />
                      <span>{label}</span>
                    </Link>
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
