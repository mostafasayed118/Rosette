'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight } from 'lucide-react';

const LABELS: Record<string, string> = {
  admin: 'Dashboard',
  orders: 'Orders',
  products: 'Products',
  inventory: 'Inventory',
  delivery: 'Delivery',
  promos: 'Promos',
  'gift-cards': 'Gift Cards',
  subscriptions: 'Subscriptions',
  plans: 'Plans',
  blog: 'Blog',
  authors: 'Authors',
  notifications: 'Notifications',
  'audit-log': 'Audit Log',
  reviews: 'Reviews',
  'cancel-requests': 'Cancel Requests',
  'change-requests': 'Change Requests',
};

export function AdminBreadcrumbs() {
  const pathname = usePathname() ?? '/admin';
  const segments = pathname.split('/').filter(Boolean);
  // segments[0] is 'admin'
  if (segments.length <= 1) return <span className="text-sm font-medium text-foreground">Dashboard</span>;

  const crumbs = segments.map((seg, idx) => {
    const href = `/${segments.slice(0, idx + 1).join('/')}`;
    const label = LABELS[seg] ?? seg;
    const isLast = idx === segments.length - 1;
    // Hide raw ids (uuid-like) from breadcrumb, show as #...
    const isId = /^[0-9a-f-]{8,}$/i.test(seg) || seg === 'new';
    const display = isId ? (seg === 'new' ? 'New' : `#${seg.slice(0, 8)}`) : label;
    return { href, label: display, isLast };
  });

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm">
      {crumbs.map((c, i) => (
        <span key={c.href} className="flex items-center gap-1">
          {i > 0 ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" /> : null}
          {c.isLast ? (
            <span className="font-medium text-foreground">{c.label}</span>
          ) : (
            <Link href={c.href} className="text-muted-foreground hover:text-foreground hover:underline underline-offset-4">
              {c.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}
