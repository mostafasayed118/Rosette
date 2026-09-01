'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Bell,
  BookOpen,
  ClipboardList,
  Boxes,
  Gift,
  Home,
  Package,
  PackageCheck,
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
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
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
  '/admin/subscriptions': PackageCheck,
  '/admin/blog': BookOpen,
  '/admin/authors': Users,
  '/admin/cancel-requests': XCircle,
  '/admin/change-requests': Pencil,
  '/admin/reviews': Star,
  '/admin/notifications': Bell,
  '/admin/audit-log': ClipboardList,
};

const FALLBACK_ICON: LucideIcon = ClipboardList;

function isActivePath(pathname: string, href: string): boolean {
  if (href === '/admin') return pathname === '/admin';
  return pathname === href || pathname.startsWith(`${href}/`);
}

type SidebarSection = {
  label: string;
  items: { href: string; label: string; badge?: number }[];
};

export function AppSidebar({ items, sections }: { items: { href: string; label: string }[]; sections?: SidebarSection[] }) {
  const pathname = usePathname();

  // Back-compat: if sections provided, render grouped; otherwise flat from items
  const groups: SidebarSection[] = sections ?? [{ label: '', items }];

  return (
    <Sidebar>
      <SidebarHeader>
        <span className="px-2 font-display text-2xl tracking-tight text-primary">Rosette</span>
      </SidebarHeader>
      <SidebarContent className="pb-[env(safe-area-inset-bottom)]">
        {groups.map((section) => (
          <SidebarGroup key={section.label || 'main'}>
            {section.label ? <SidebarGroupLabel>{section.label}</SidebarGroupLabel> : null}
            <SidebarMenu>
              {section.items.map(({ href, label, badge }) => {
                const Icon = ICONS[href] ?? FALLBACK_ICON;
                if (process.env.NODE_ENV !== 'production' && !ICONS[href]) {
                  console.warn(`[AppSidebar] missing icon for ${href}, using fallback`);
                }
                const active = isActivePath(pathname ?? '', href);
                return (
                  <SidebarMenuItem key={href}>
                    <SidebarMenuButton asChild isActive={active} tooltip={label}>
                      <Link href={href} prefetch>
                        <Icon />
                        <span>{label}</span>
                      </Link>
                    </SidebarMenuButton>
                    {typeof badge === 'number' && badge > 0 ? (
                      <SidebarMenuBadge className={active ? 'bg-sidebar-accent' : 'bg-primary text-primary-foreground'}>
                        {badge > 99 ? '99+' : badge}
                      </SidebarMenuBadge>
                    ) : null}
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>
    </Sidebar>
  );
}
