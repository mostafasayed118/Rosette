# Admin Stitch Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align the admin surface to the storefront's Stitch design system using shared primitives, centralized helpers, and shadcn/ui controls.

**Architecture:** Add `app/admin/layout.tsx` to own `SidebarProvider`, introduce `PageHeader`/`KeyValueRow`/`ImagePreview`/`RequestTabs` admin primitives, migrate hand-rolled tabs/pagination/accordion to shadcn equivalents, and replace duplicated date/eyebrow/icon patterns with centralized helpers.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS v4, shadcn/ui, vitest, Playwright

**Spec:** docs/superpowers/specs/2026-08-27-admin-stitch-alignment-design.md

## Global Constraints

- Admin is denser than storefront: compact h1 `font-display text-[clamp(1.75rem,3vw,2.25rem)]`, 48×48 thumbnails, 32×32 avatars.
- No token/font/palette changes in `app/globals.css`.
- No new dependencies beyond shadcn CLI scaffolding of `tabs`, `pagination`, `accordion`.
- TDD in isolated worktree; no live Supabase or browser in unit/component tests.
- Gate: `npm test` + `tsc --noEmit` + `npm run build` + `git diff --check` + secret scan before merge.

---

### Task 1: Scaffold missing shadcn primitives + create admin helpers

**Files:**
- Create: `components/ui/tabs.tsx`
- Create: `components/ui/pagination.tsx`
- Create: `components/ui/accordion.tsx`
- Create: `components/admin/PageHeader.tsx`
- Create: `components/admin/KeyValueRow.tsx`
- Create: `components/admin/ImagePreview.tsx`
- Create: `components/admin/RequestTabs.tsx`
- Test: `tests/domain/admin-primitives.test.ts`

**Interfaces:**
- Consumes: none
- Produces: `PageHeader`, `KeyValueRow`, `ImagePreview`, `RequestTabs` components; shadcn `Tabs`, `Pagination`, `Accordion` primitives

- [ ] **Step 1: Write the failing test**

Create `tests/domain/admin-primitives.test.ts`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PageHeader } from '@/components/admin/PageHeader';
import { KeyValueRow } from '@/components/admin/KeyValueRow';
import { ImagePreview } from '@/components/admin/ImagePreview';
import { RequestTabs } from '@/components/admin/RequestTabs';

describe('admin primitives', () => {
  it('PageHeader renders eyebrow, title, description, and actions', () => {
    render(<PageHeader eyebrow="Ops" title="Products" description="Manage catalog" actions={<button>New</button>} />);
    expect(screen.getByText('Ops')).toHaveClass('text-sage');
    expect(screen.getByText('Products')).toBeInTheDocument();
    expect(screen.getByText('Manage catalog')).toBeInTheDocument();
    expect(screen.getByText('New')).toBeInTheDocument();
  });

  it('PageHeader omits description and actions when not provided', () => {
    render(<PageHeader eyebrow="Ops" title="Products" />);
    expect(screen.getByText('Products')).toBeInTheDocument();
  });

  it('KeyValueRow renders label and value with documented classes', () => {
    render(<KeyValueRow label="Total" value={<strong>100</strong>} />);
    expect(screen.getByText('Total')).toHaveClass('text-muted-foreground');
    expect(screen.getByText('100')).toHaveClass('text-foreground');
  });

  it('ImagePreview renders next/image with correct size for product kind', () => {
    render(<ImagePreview url="https://example.com/img.jpg" kind="product" />);
    const img = screen.getByRole('img', { name: '' });
    expect(img).toHaveAttribute('width', '96');
    expect(img).toHaveAttribute('height', '96');
    expect(img).toHaveClass('rounded-md', 'object-cover');
  });

  it('ImagePreview renders fallback chip for avatar kind without url', () => {
    render(<ImagePreview url="" kind="avatar" fallback="JD" />);
    expect(screen.getByText('JD')).toBeInTheDocument();
  });

  it('RequestTabs renders tab triggers wired to links', () => {
    render(<RequestTabs basePath="/admin/reviews" tabs={[{ value: 'pending', label: 'Pending' }]} current="pending" />);
    expect(screen.getByText('Pending')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/domain/admin-primitives.test.ts`
Expected: FAIL with "Cannot find module '@/components/admin/PageHeader'" and missing shadcn primitives

- [ ] **Step 3: Write minimal implementation**

Run: `npx shadcn@latest add tabs pagination accordion`

Create `components/admin/PageHeader.tsx`:

```tsx
import type { ReactNode } from 'react';

type PageHeaderProps = {
  eyebrow: string;
  title: string;
  description?: string;
  actions?: ReactNode;
};

export function PageHeader({ eyebrow, title, description, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-xs font-bold uppercase tracking-[.16em] text-sage">{eyebrow}</p>
        <h1 className="font-display text-[clamp(1.75rem,3vw,2.25rem)] leading-tight tracking-[-.02em] text-on-surface">{title}</h1>
        {description ? (
          <p className="mt-2 text-sm text-on-surface-variant max-w-prose">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}
```

Create `components/admin/KeyValueRow.tsx`:

```tsx
import type { ReactNode } from 'react';

export function KeyValueRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border/50 py-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-end text-foreground">{value}</dd>
    </div>
  );
}
```

Create `components/admin/ImagePreview.tsx`:

```tsx
'use client';

import Image from 'next/image';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type Kind = 'product' | 'avatar' | 'cover';

type ImagePreviewProps = {
  url?: string | null;
  kind?: Kind;
  width?: number;
  height?: number;
  fallback?: ReactNode;
};

const DEFAULT_SIZES: Record<Kind, { width: number; height: number; radius: string }> = {
  product: { width: 96, height: 96, radius: 'rounded-md' },
  avatar: { width: 64, height: 64, radius: 'rounded-full' },
  cover: { width: 96, height: 96, radius: 'rounded-md' },
};

export function ImagePreview({ url, kind = 'product', width, height, fallback }: ImagePreviewProps) {
  const defaults = DEFAULT_SIZES[kind];
  const w = width ?? defaults.width;
  const h = height ?? defaults.height;
  const radius = defaults.radius;

  if (!url) {
    return (
      <div className={cn('flex items-center justify-center bg-muted', radius)} style={{ width: w, height: h }}>
        {fallback}
      </div>
    );
  }

  return (
    <Image
      src={url}
      alt=""
      width={w}
      height={h}
      className={cn(radius, 'object-cover')}
      sizes={`${w}px`}
    />
  );
}
```

Create `components/admin/RequestTabs.tsx`:

```tsx
'use client';

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import Link from 'next/link';

type Tab = { value: string; label: string };

type RequestTabsProps = {
  basePath: string;
  tabs: Tab[];
  current: string;
  paramName?: string;
};

export function RequestTabs({ basePath, tabs, current, paramName = 'status' }: RequestTabsProps) {
  return (
    <Tabs defaultValue={current} className="mt-4">
      <TabsList>
        {tabs.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value} asChild>
            <Link href={`${basePath}?${paramName}=${tab.value}`}>{tab.label}</Link>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/domain/admin-primitives.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add components/ui/tabs.tsx components/ui/pagination.tsx components/ui/accordion.tsx
git add components/admin/PageHeader.tsx components/admin/KeyValueRow.tsx components/admin/ImagePreview.tsx components/admin/RequestTabs.tsx
git add tests/domain/admin-primitives.test.ts
git commit -m "feat: scaffold shadcn tabs/pagination/accordion and admin primitives"
```

---

### Task 2: Layout lift — `app/admin/layout.tsx` + `AdminShell` refactor

**Files:**
- Create: `app/admin/layout.tsx`
- Modify: `components/admin/AdminShell.tsx`
- Test: `tests/domain/admin-layout.test.ts`

**Interfaces:**
- Consumes: `SidebarProvider`, `AdminShell`
- Produces: `AdminLayout` wrapper owning the provider; `AdminShell` reduced to inner shell (header, sidebar trigger, sign-out, main)

- [ ] **Step 1: Write the failing test**

Create `tests/domain/admin-layout.test.ts`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AdminShell } from '@/components/admin/AdminShell';

describe('admin layout', () => {
  it('AdminShell renders children without owning SidebarProvider', () => {
    render(<AdminShell><p data-testid="child">child</p></AdminShell>);
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/domain/admin-layout.test.ts`
Expected: FAIL or PASS trivially; if PASS, add layout smoke test and refactor

- [ ] **Step 3: Write minimal implementation**

Create `app/admin/layout.tsx`:

```tsx
import type { ReactNode } from 'react';
import { SidebarProvider } from '@/components/ui/sidebar';
import { AdminShell } from '@/components/admin/AdminShell';

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      <AdminShell>{children}</AdminShell>
    </SidebarProvider>
  );
}
```

Modify `components/admin/AdminShell.tsx` — remove `SidebarProvider` wrapper, fix `max-md:block` to `md:hidden`:

```tsx
import type { ReactNode } from 'react';
import { SidebarInset, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/admin/AppSidebar';
import { Button } from '@/components/ui/button';
import { signOut } from '@/features/auth/actions';
import { getServerT } from '@/features/i18n/server';

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
  { href: '/admin/blog', key: 'blogTitle' },
  { href: '/admin/authors', key: 'authors' },
  { href: '/admin/notifications', key: 'notifications' },
] as const;

export async function AdminShell({ children }: { children: ReactNode }) {
  const { t } = await getServerT();
  const items = NAV_ITEMS.map((item) => ({ href: item.href, label: t(item.key) }));
  return (
    <>
      <AppSidebar items={items} />
      <SidebarInset>
        <header className="flex h-14 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ms-2" />
          <span className="font-display text-lg text-primary md:hidden">Rosette</span>
          <form action={signOut} className="ms-auto"><Button variant="outline" size="sm" type="submit">{t('signOut')}</Button></form>
        </header>
        <main className="p-4 md:p-8">{children}</main>
      </SidebarInset>
    </>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/domain/admin-layout.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/admin/layout.tsx components/admin/AdminShell.tsx tests/domain/admin-layout.test.ts
git commit -m "feat: lift SidebarProvider into app/admin/layout.tsx"
```

---

### Task 3: Sidebar icon map completion + date helper

**Files:**
- Modify: `components/admin/AppSidebar.tsx`
- Create: `lib/date.ts`
- Test: `tests/domain/admin-sidebar-icons.test.ts`, `tests/lib/date.test.ts`

**Interfaces:**
- Consumes: `NAV_ITEMS` from `AdminShell.tsx`
- Produces: complete 13-entry icon map; `formatDateTime`, `formatDate` helpers

- [ ] **Step 1: Write the failing test**

Create `tests/domain/admin-sidebar-icons.test.ts`:

```tsx
import { describe, expect, it } from 'vitest';
import { AppSidebar } from '@/components/admin/AppSidebar';
import { render, screen } from '@testing-library/react';

const ITEMS = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/orders', label: 'Orders' },
  { href: '/admin/cancel-requests', label: 'Cancel requests' },
  { href: '/admin/change-requests', label: 'Change requests' },
  { href: '/admin/reviews', label: 'Reviews' },
  { href: '/admin/products', label: 'Products' },
  { href: '/admin/inventory', label: 'Inventory' },
  { href: '/admin/delivery', label: 'Delivery' },
  { href: '/admin/promos', label: 'Promos' },
  { href: '/admin/gift-cards', label: 'Gift cards' },
  { href: '/admin/blog', label: 'Blog' },
  { href: '/admin/authors', label: 'Authors' },
  { href: '/admin/notifications', label: 'Notifications' },
];

describe('AppSidebar icons', () => {
  it('renders an icon for every nav item', () => {
    render(<AppSidebar items={ITEMS} />);
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(ITEMS.length);
  });
});
```

Create `tests/lib/date.test.ts`:

```tsx
import { describe, expect, it } from 'vitest';
import { formatDateTime, formatDate } from '@/lib/date';

describe('date helpers', () => {
  it('returns a string for valid input', () => {
    expect(typeof formatDateTime('2024-01-15T10:30:00Z', 'en')).toBe('string');
  });

  it('returns Invalid Date for invalid input', () => {
    expect(formatDateTime('not-a-date', 'en')).toBe('Invalid Date');
  });

  it('formats date only', () => {
    expect(typeof formatDate('2024-01-15T10:30:00Z', 'en')).toBe('string');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/domain/admin-sidebar-icons.test.ts tests/lib/date.test.ts`
Expected: FAIL with missing modules

- [ ] **Step 3: Write minimal implementation**

Modify `components/admin/AppSidebar.tsx`:

```tsx
'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookOpen, Boxes, Gift, Bell, Home, Package, Pencil, ShoppingBag, Star, Truck, Users, XCircle, type LucideIcon } from 'lucide-react';
import { Sidebar, SidebarContent, SidebarGroup, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';

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
      <SidebarHeader><span className="px-2 font-display text-2xl tracking-tight text-primary">Rosette</span></SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            {items.map(({ href, label }) => {
              const Icon = ICONS[href];
              if (!Icon) return null;
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
```

Create `lib/date.ts`:

```ts
import type { Locale } from '@/features/i18n/types';

function localeTag(locale: Locale): string {
  switch (locale) {
    case 'ar':
      return 'ar-EG';
    case 'fr':
      return 'fr-FR';
    default:
      return 'en-GB';
  }
}

export function formatDateTime(value: string | Date, locale: Locale): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return date.toLocaleString(localeTag(locale), { dateStyle: 'medium', timeStyle: 'short' });
}

export function formatDate(value: string | Date, locale: Locale): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return date.toLocaleDateString(localeTag(locale), { dateStyle: 'medium' });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/domain/admin-sidebar-icons.test.ts tests/lib/date.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add components/admin/AppSidebar.tsx lib/date.ts tests/domain/admin-sidebar-icons.test.ts tests/lib/date.test.ts
git commit -m "feat: complete sidebar icon map and add date formatting helpers"
```

---

### Task 4: Status label expansion

**Files:**
- Modify: `features/admin/status-labels.ts`
- Modify: `tests/domain/status-labels.test.ts`

**Interfaces:**
- Consumes: existing `BadgeTone`, `fulfillmentBadgeVariant`, `paymentBadgeVariant`, `deliveryBadgeVariant`
- Produces: unified variant map + new per-domain key maps + label/variant functions for reviews, cancel-requests, change-requests, promos, gift-cards, notifications

- [ ] **Step 1: Write the failing test**

NOTE: The unified mapping changes some existing badge variants per the spec:
- `deliveryBadgeVariant('sent')` changes from `'success'` to `'default'`
- `fulfillmentBadgeVariant('preparing')` changes from `'secondary'` to `'default'`

Update the existing tests in `tests/domain/status-labels.test.ts` to match:
```tsx
it('assigns fulfillment badge variants', () => {
  expect(fulfillmentBadgeVariant('delivered')).toBe('success');
  expect(fulfillmentBadgeVariant('cancelled')).toBe('destructive');
  expect(fulfillmentBadgeVariant('out_for_delivery')).toBe('default');
  expect(fulfillmentBadgeVariant('preparing')).toBe('default'); // CHANGED: was 'secondary'
  expect(fulfillmentBadgeVariant('ready_for_delivery')).toBe('default'); // CHANGED: was 'secondary'
  expect(fulfillmentBadgeVariant('confirmed')).toBe('default'); // CHANGED: was 'secondary'
});

it('assigns delivery badge variants', () => {
  expect(deliveryBadgeVariant('sent')).toBe('default'); // CHANGED: was 'success'
  expect(deliveryBadgeVariant('failed')).toBe('destructive');
  expect(deliveryBadgeVariant('pending')).toBe('secondary');
  expect(deliveryBadgeVariant('weird')).toBe('secondary');
});
```

Extend `tests/domain/status-labels.test.ts` with:

```tsx
import { reviewBadgeVariant, reviewLabel, reviewStatusKeys, cancelRequestBadgeVariant, cancelRequestLabel, cancelRequestStatusKeys, changeRequestBadgeVariant, changeRequestLabel, changeRequestStatusKeys, promoBadgeVariant, promoLabel, promoStatusKeys, giftCardBadgeVariant, giftCardLabel, giftCardStatusKeys, notificationBadgeVariant, notificationLabel, notificationStatusKeys } from '@/features/admin/status-labels';

describe('unified status labels', () => {
  it('maps review statuses', () => {
    expect(reviewStatusKeys).toEqual({ pending: 'statusPending', approved: 'statusApproved' });
    expect(reviewBadgeVariant('approved')).toBe('success');
    expect(reviewBadgeVariant('pending')).toBe('secondary');
  });

  it('maps cancel request statuses', () => {
    expect(cancelRequestStatusKeys).toEqual({ pending: 'statusPending', approved: 'cancelRequestApproved', rejected: 'cancelRequestRejected' });
    expect(cancelRequestBadgeVariant('approved')).toBe('success');
    expect(cancelRequestBadgeVariant('rejected')).toBe('destructive');
  });

  it('maps change request statuses', () => {
    expect(changeRequestStatusKeys).toEqual({ pending: 'statusPending', approved: 'changeApproved', applied: 'changeApplied', rejected: 'changeRejected' });
    expect(changeRequestBadgeVariant('applied')).toBe('success');
    expect(changeRequestBadgeVariant('rejected')).toBe('destructive');
  });

  it('maps promo active state', () => {
    expect(promoStatusKeys).toEqual({ active: 'active', inactive: 'inactive' });
    expect(promoBadgeVariant(true)).toBe('success');
    expect(promoBadgeVariant(false)).toBe('secondary');
  });

  it('maps gift card statuses', () => {
    expect(giftCardStatusKeys).toEqual({ active: 'giftCardStatus_active', depleted: 'giftCardStatus_depleted', expired: 'giftCardStatus_expired', void: 'giftCardStatus_void' });
    expect(giftCardBadgeVariant('depleted')).toBe('success');
    expect(giftCardBadgeVariant('expired')).toBe('destructive');
  });

  it('maps notification delivery statuses', () => {
    expect(notificationStatusKeys).toEqual({ pending: 'statusPending', sent: 'statusSent', failed: 'statusFailed' });
    expect(notificationBadgeVariant('sent')).toBe('default');
    expect(notificationBadgeVariant('failed')).toBe('destructive');
  });

  it('falls back to secondary for unknown statuses', () => {
    expect(reviewBadgeVariant('weird')).toBe('secondary');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/domain/status-labels.test.ts`
Expected: FAIL with missing exports

- [ ] **Step 3: Write minimal implementation**

Modify `features/admin/status-labels.ts`:

```ts
export type BadgeTone = 'success' | 'warning' | 'destructive' | 'default' | 'secondary';

export const fulfillmentStatusKeys: Record<string, string> = {
  confirmed: 'statusConfirmed',
  preparing: 'statusPreparing',
  ready_for_delivery: 'statusReadyForDelivery',
  out_for_delivery: 'statusOutForDelivery',
  delivered: 'statusDelivered',
  cancelled: 'statusCancelled',
};

export const paymentStatusKeys: Record<string, string> = {
  pending: 'statusPending',
  payment_started: 'statusPaymentStarted',
  paid: 'statusPaid',
  payment_failed: 'statusPaymentFailed',
  cancelled: 'statusCancelled',
  refunded: 'statusRefunded',
};

export const deliveryStatusKeys: Record<string, string> = {
  pending: 'statusPending',
  sent: 'statusSent',
  failed: 'statusFailed',
};

export const reviewStatusKeys: Record<string, string> = {
  pending: 'statusPending',
  approved: 'statusApproved',
};

export const cancelRequestStatusKeys: Record<string, string> = {
  pending: 'statusPending',
  approved: 'cancelRequestApproved',
  rejected: 'cancelRequestRejected',
};

export const changeRequestStatusKeys: Record<string, string> = {
  pending: 'statusPending',
  approved: 'changeApproved',
  applied: 'changeApplied',
  rejected: 'changeRejected',
};

export const promoStatusKeys: Record<string, string> = {
  active: 'active',
  inactive: 'inactive',
};

export const giftCardStatusKeys: Record<string, string> = {
  active: 'giftCardStatus_active',
  depleted: 'giftCardStatus_depleted',
  expired: 'giftCardStatus_expired',
  void: 'giftCardStatus_void',
};

export const notificationStatusKeys: Record<string, string> = {
  pending: 'statusPending',
  sent: 'statusSent',
  failed: 'statusFailed',
};

function unifiedBadgeVariant(status: string): BadgeTone {
  if (['paid', 'delivered', 'active', 'completed', 'approved', 'redeemed', 'applied'].includes(status)) return 'success';
  if (['preparing', 'ready_for_delivery', 'payment_started', 'confirmed', 'out_for_delivery', 'sent', 'in_progress'].includes(status)) return 'default';
  if (['pending', 'scheduled', 'draft'].includes(status)) return 'secondary';
  if (['refunded', 'partially_refunded'].includes(status)) return 'warning';
  if (['payment_failed', 'cancelled', 'expired', 'rejected', 'failed'].includes(status)) return 'destructive';
  return 'secondary';
}

export function fulfillmentBadgeVariant(status: string): BadgeTone {
  return unifiedBadgeVariant(status);
}

export function paymentBadgeVariant(status: string): BadgeTone {
  return unifiedBadgeVariant(status);
}

export function deliveryBadgeVariant(status: string): BadgeTone {
  return unifiedBadgeVariant(status);
}

export function reviewBadgeVariant(status: string): BadgeTone {
  return unifiedBadgeVariant(status);
}

export function cancelRequestBadgeVariant(status: string): BadgeTone {
  return unifiedBadgeVariant(status);
}

export function changeRequestBadgeVariant(status: string): BadgeTone {
  return unifiedBadgeVariant(status);
}

export function promoBadgeVariant(active: boolean): BadgeTone {
  return unifiedBadgeVariant(active ? 'active' : 'inactive');
}

export function giftCardBadgeVariant(status: string): BadgeTone {
  return unifiedBadgeVariant(status);
}

export function notificationBadgeVariant(status: string): BadgeTone {
  return unifiedBadgeVariant(status);
}

export function fulfillmentLabel(status: string, t: (key: string) => string): string {
  return t(fulfillmentStatusKeys[status] ?? status);
}

export function paymentLabel(status: string, t: (key: string) => string): string {
  return t(paymentStatusKeys[status] ?? status);
}

export function deliveryLabel(status: string, t: (key: string) => string): string {
  return t(deliveryStatusKeys[status] ?? status);
}

export function reviewLabel(status: string, t: (key: string) => string): string {
  return t(reviewStatusKeys[status] ?? status);
}

export function cancelRequestLabel(status: string, t: (key: string) => string): string {
  return t(cancelRequestStatusKeys[status] ?? status);
}

export function changeRequestLabel(status: string, t: (key: string) => string): string {
  return t(changeRequestStatusKeys[status] ?? status);
}

export function promoSuffixLabel(active: boolean, t: (key: string) => string): string {
  return t(active ? 'active' : 'inactive');
}

export function giftCardLabel(status: string, t: (key: string) => string): string {
  return t(giftCardStatusKeys[status] ?? status);
}

export function notificationLabel(status: string, t: (key: string) => string): string {
  return t(notificationStatusKeys[status] ?? status);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/domain/status-labels.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add features/admin/status-labels.ts tests/domain/status-labels.test.ts features/i18n/dictionaries.ts
git commit -m "feat: extend status labels with unified variant mapping"
```

NOTE: `statusApproved` is a new i18n key used by `reviewStatusKeys.approved`. Add to all 3 locales in `features/i18n/dictionaries.ts`:

```ts
// en: statusApproved: 'Approved'
// ar: statusApproved: 'موافق عليه' (or 'تمت الموافقة')
// fr: statusApproved: 'Approuvé'
```

---

### Task 5: Loading + error page modernization

**Files:**
- Modify: `app/admin/loading.tsx`
- Modify: `app/admin/error.tsx`
- Test: `tests/domain/admin-loading-error.test.ts`

**Interfaces:**
- Consumes: shadcn `Skeleton`, `Button`, `Card`
- Produces: tokenized loading skeleton and error boundary

- [ ] **Step 1: Write the failing test**

Create `tests/domain/admin-loading-error.test.ts`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import AdminLoading from '@/app/admin/loading';
import AdminError from '@/app/admin/error';

const fakeError = { message: 'boom', digest: 'abc123' } as Error & { digest?: string };

describe('admin loading and error', () => {
  it('loading renders Skeleton blocks without legacy classes', () => {
    const { container } = render(<AdminLoading />);
    expect(container.querySelector('.bg-surface-container')).toBeNull();
    expect(container.querySelector('[data-slot="skeleton"]')).not.toBeNull();
  });

  it('error renders Button and Card without raw button or price class', () => {
    render(<AdminError error={fakeError} reset={() => {}} />);
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
    const container = document.querySelector('[role="alert"]');
    expect(container?.textContent).not.toContain('price');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/domain/admin-loading-error.test.ts`
Expected: FAIL with missing modules

- [ ] **Step 3: Write minimal implementation**

Modify `app/admin/loading.tsx`:

```tsx
import { Skeleton } from '@/components/ui/skeleton';

export default function AdminLoading() {
  return (
    <div className="grid gap-6 p-4 md:p-8" role="status" aria-live="polite">
      <span className="sr-only">Loading</span>
      <div className="flex items-center gap-4">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-48" />
        <div className="ms-auto flex gap-2">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-24" />
        </div>
      </div>
      <div className="grid gap-3">
        {[0, 1, 2, 3, 4, 5].map((row) => (
          <Skeleton key={row} className="h-12 w-full" />
        ))}
      </div>
    </div>
  );
}
```

Modify `app/admin/error.tsx`:

```tsx
'use client';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="grid min-h-[60vh] place-content-center justify-items-start gap-5 p-8" role="alert">
      <Card className="p-6">
        <h1 className="font-display text-3xl font-medium text-primary">This panel could not load.</h1>
        <p className="max-w-md text-muted-foreground">The request failed. Retry, or check the service logs if it keeps happening.</p>
        <Button variant="default" size="lg" onClick={reset}>Try again</Button>
        {error.digest ? <p className="text-xs text-muted-foreground/70">ref {error.digest}</p> : null}
      </Card>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/domain/admin-loading-error.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/admin/loading.tsx app/admin/error.tsx tests/domain/admin-loading-error.test.ts
git commit -m "feat: modernize admin loading and error boundaries"
```

---

### Task 6: PageHeader rollout + AdminShell removal from all admin pages

**Files:**
- Modify: all 20 admin page files under `app/admin/`
- Test: `tests/domain/admin-pages-smoke.test.ts`

**Interfaces:**
- Consumes: `PageHeader`, `AdminShell`, `formatDateTime`, `formatDate`
- Produces: every admin page returns content directly, wrapped only by `app/admin/layout.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/domain/admin-pages-smoke.test.ts`:

```tsx
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const ADMIN_PAGES = [
  'app/admin/page.tsx',
  'app/admin/orders/page.tsx',
  'app/admin/orders/[id]/page.tsx',
  'app/admin/products/page.tsx',
  'app/admin/products/[id]/page.tsx',
  'app/admin/inventory/page.tsx',
  'app/admin/delivery/page.tsx',
  'app/admin/promos/page.tsx',
  'app/admin/gift-cards/page.tsx',
  'app/admin/notifications/page.tsx',
  'app/admin/blog/page.tsx',
  'app/admin/blog/[id]/page.tsx',
  'app/admin/authors/page.tsx',
  'app/admin/authors/[id]/page.tsx',
  'app/admin/cancel-requests/page.tsx',
  'app/admin/change-requests/page.tsx',
  'app/admin/reviews/page.tsx',
];

describe('admin pages no AdminShell wrapper', () => {
  for (const rel of ADMIN_PAGES) {
    it(rel, () => {
      const source = readFileSync(join(process.cwd(), rel), 'utf-8');
      expect(source).not.toMatch(/<AdminShell>/);
      expect(source).not.toMatch(/from ['"]@\/components\/admin\/AdminShell['"]/);
    });
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/domain/admin-pages-smoke.test.ts`
Expected: FAIL — every page still contains `<AdminShell>`

- [ ] **Step 3: Write minimal implementation**

Apply the following pattern to each page file.

Pattern A — simple eyebrow + title (dashboard, orders, inventory, products list, delivery, promos, gift-cards, notifications, blog list, authors list):

```tsx
// Before:
return <AdminShell>
  <p className="text-xs font-bold uppercase tracking-[.16em] text-sage">{t('...')}</p>
  <h1 className="font-display text-[clamp(2rem,4vw,3rem)] leading-tight tracking-[-.02em]">{t('...')}</h1>
  ...
</AdminShell>;

// After:
return (
  <PageHeader eyebrow={t('...')} title={t('...')} />
  ...
);
```

Pattern B — eyebrow + title + actions (products list, blog list):

```tsx
// Before:
return <AdminShell>
  <p className="text-xs font-bold uppercase tracking-[.16em] text-sage">{t('...')}</p>
  <div className="flex items-end justify-between gap-6">
    <h1 className="...">{t('...')}</h1>
    <Button asChild size="sm"><Link href="...">{t('...')}</Link></Button>
  </div>
  ...
</AdminShell>;

// After:
return (
  <PageHeader eyebrow={t('...')} title={t('...')} actions={<Button asChild size="sm"><Link href="...">{t('...')}</Link></Button>} />
  ...
);
```

Pattern C — edit page with entity name as title (products/[id], blog/[id], authors/[id]):

```tsx
// Before:
return <AdminShell>
  <p className="text-xs font-bold uppercase tracking-[.16em] text-sage">{t('catalogOperations')}</p>
  <h1 className="...">{data.name_en}</h1>
  <ProductForm initial={initial} />
</AdminShell>;

// After:
return (
  <PageHeader eyebrow={t('catalogOperations')} title={data.name_en} />
  <ProductForm initial={initial} />
);
```

Pattern D — order detail with breadcrumb eyebrow (orders/[id]):

```tsx
// Before:
return <AdminShell>
  <p className="text-xs font-bold uppercase tracking-[.16em] text-sage"><Link ...>{t('orders')}</Link> · {order.display_number}</p>
  <h1 className="...">{order.display_number}</h1>
  ...
</AdminShell>;

// After:
return (
  <>
    <p className="text-xs font-bold uppercase tracking-[.16em] text-sage"><Link className="underline underline-offset-4" href="/admin/orders">{t('orders')}</Link></p>
    <PageHeader eyebrow="" title={order.display_number} description={`${formatMoney(order.total_minor, locale)} · ${paymentLabel(order.payment_status, t)} · ${fulfillmentLabel(order.fulfillment_status, t)}`} />
    ...
  </>
);
```

Per-page exact replacements:

`app/admin/page.tsx`:
```tsx
return (
  <PageHeader eyebrow={t('adminEyebrow')} title={t('adminDashboard')} description={t('signedInAs', { role: admin.role })} />
  <div className="mb-8 mt-6 grid grid-cols-[repeat(auto-fit,minmax(14rem,1fr))] gap-4">...</div>
);
```

`app/admin/orders/page.tsx`:
```tsx
return (
  <PageHeader eyebrow={t('adminEyebrow')} title={t('orders')} />
  ...
);
```

`app/admin/products/page.tsx`:
```tsx
return (
  <PageHeader eyebrow={t('catalogOperations')} title={t('products')} actions={<Button asChild size="sm"><Link href="/admin/products/new">{t('newProduct')}</Link></Button>} />
  <Card className="mt-6">...</Card>
);
```

`app/admin/products/[id]/page.tsx`:
```tsx
return (
  <PageHeader eyebrow={t('catalogOperations')} title={data.name_en} />
  <ProductForm initial={initial} />
);
```

`app/admin/products/new/page.tsx`:
```tsx
return (
  <PageHeader eyebrow={t('catalogOperations')} title={t('newProduct')} />
  <ProductForm />
);
```

`app/admin/inventory/page.tsx`:
```tsx
return (
  <PageHeader eyebrow={t('stockOperations')} title={t('inventory')} />
  <Card className="mt-6">...</Card>
);
```

`app/admin/delivery/page.tsx`:
```tsx
return (
  <PageHeader eyebrow={t('deliveryOperations')} title={t('deliveryRules')} />
  <AddCityForm />
  <div className="mt-6 grid gap-4">...</div>
);
```

`app/admin/promos/page.tsx`:
```tsx
return (
  <PageHeader eyebrow={t('promoOperations')} title={t('promos')} />
  <AddPromoForm />
  <div className="mt-6 grid gap-4">...</div>
);
```

`app/admin/gift-cards/page.tsx`:
```tsx
return (
  <PageHeader eyebrow={t('giftCardOperations')} title={t('giftCards')} />
  <Card className="mt-6"><CardHeader><CardTitle>{t('issueGiftCard')}</CardTitle></CardHeader><CardContent><AdminGiftCardForm /></CardContent></Card>
  <div className="mt-6 grid gap-4">...</div>
);
```

`app/admin/notifications/page.tsx`:
```tsx
return (
  <PageHeader eyebrow={t('notificationOperations')} title={t('notifications')} />
  <RetryEmailsButton />
  <NotificationsToolbar />
  ...
);
```

`app/admin/blog/page.tsx`:
```tsx
return (
  <PageHeader eyebrow={t('blogOperations')} title={t('blogTitle')} actions={<Link className="text-sm text-primary underline underline-offset-4" href="/admin/blog/new">{t('newBlogPost')}</Link>} />
  ...
);
```

`app/admin/blog/[id]/page.tsx`:
```tsx
// Two return paths: new vs edit
// For new (id === 'new'):
return (
  <PageHeader eyebrow={t('blogOperations')} title={t('newBlogPost')} />
  <div className="mt-6"><BlogForm post={blank} authors={authors} /></div>
);
// For edit (existing id):
return (
  <PageHeader eyebrow={t('blogOperations')} title={t('editBlogPost')} />
  <p className="mt-1"><Link className="text-sm text-primary underline underline-offset-4" href="/admin/blog">{t('backToBlog')}</Link></p>
  <div className="mt-6"><BlogForm post={post} id={id} authors={authors} /></div>
);
```

`app/admin/blog/new/page.tsx`:
NOTE: This file does not exist. `app/admin/blog/[id]/page.tsx` handles both `'new'` and existing IDs. No migration needed for a separate new page.

`app/admin/authors/page.tsx`:
```tsx
return (
  <PageHeader eyebrow={t('authorOperations')} title={t('authors')} actions={<Link className="text-sm text-primary underline underline-offset-4" href="/admin/authors/new">{t('newAuthor')}</Link>} />
  ...
);
```

`app/admin/authors/[id]/page.tsx`:
```tsx
// Two return paths: new vs edit
// For new (id === 'new'):
return (
  <PageHeader eyebrow={t('authorOperations')} title={t('newAuthor')} />
  <div className="mt-6"><AuthorForm author={blank} /></div>
);
// For edit (existing id):
return (
  <PageHeader eyebrow={t('authorOperations')} title={t('editAuthor')} />
  <p className="mt-1"><Link className="text-sm text-primary underline underline-offset-4" href="/admin/authors">{t('backToAuthors')}</Link></p>
  <div className="mt-6"><AuthorForm author={author} id={id} /></div>
);
```

`app/admin/authors/new/page.tsx`:
NOTE: This file does not exist. `app/admin/authors/[id]/page.tsx` handles both `'new'` and existing IDs. No migration needed for a separate new page.

`app/admin/cancel-requests/page.tsx`:
```tsx
return (
  <PageHeader eyebrow={t('customerOrders')} title={t('cancelRequests')} />
  <AutoRefresh />
  <RequestTabs basePath="/admin/cancel-requests" tabs={[
    { value: 'pending', label: t('pendingRequests', { count: pending.length }) },
    { value: 'resolved', label: t('resolvedRequests', { count: resolved.length }) },
  ]} current={showResolved ? 'resolved' : 'pending'} />
  ...
);
```

`app/admin/change-requests/page.tsx`:
```tsx
return (
  <PageHeader eyebrow={t('customerOrders')} title={t('changeRequests')} />
  <AutoRefresh />
  <RequestTabs basePath="/admin/change-requests" tabs={[
    { value: 'pending', label: t('pendingRequests', { count: active.length }) },
    { value: 'resolved', label: t('resolvedRequests', { count: resolved.length }) },
  ]} current={showResolved ? 'resolved' : 'pending'} />
  ...
);
```

`app/admin/reviews/page.tsx`:
```tsx
return (
  <PageHeader eyebrow={t('reviews')} title={t('reviews')} />
  <AutoRefresh />
  <RequestTabs basePath="/admin/reviews" tabs={[
    { value: 'pending', label: t('pendingRequests', { count: pending.length }) },
    { value: 'approved', label: t('resolvedRequests', { count: approved.length }) },
  ]} current={showApproved ? 'approved' : 'pending'} paramName="status" />
  ...
);
```

After updating all pages, remove the `AdminShell` import from every page file.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/domain/admin-pages-smoke.test.ts`
Expected: PASS — no page contains `<AdminShell>`

- [ ] **Step 5: Commit**

```bash
git add app/admin/page.tsx app/admin/orders/page.tsx app/admin/orders/[id]/page.tsx app/admin/products/page.tsx app/admin/products/[id]/page.tsx app/admin/inventory/page.tsx app/admin/delivery/page.tsx app/admin/promos/page.tsx app/admin/gift-cards/page.tsx app/admin/notifications/page.tsx app/admin/blog/page.tsx app/admin/blog/[id]/page.tsx app/admin/authors/page.tsx app/admin/authors/[id]/page.tsx app/admin/cancel-requests/page.tsx app/admin/change-requests/page.tsx app/admin/reviews/page.tsx tests/domain/admin-pages-smoke.test.ts
git commit -m "feat: roll out PageHeader and remove AdminShell from all admin pages"
```

---

### Task 7: Replace hand-rolled tabs, pagination, and accordion

**Files:**
- Modify: `app/admin/reviews/page.tsx`
- Modify: `app/admin/cancel-requests/page.tsx`
- Modify: `app/admin/change-requests/page.tsx`
- Modify: `app/admin/notifications/page.tsx`
- Modify: `app/admin/gift-cards/page.tsx`
- Test: `tests/domain/admin-controls.test.ts`

**Interfaces:**
- Consumes: `RequestTabs`, shadcn `Pagination`, `Accordion`
- Produces: URL-driven tabs, shadcn pagination, shadcn accordion

- [ ] **Step 1: Write the failing test**

Create `tests/domain/admin-controls.test.ts`:

```tsx
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('admin hand-rolled controls removed', () => {
  it('reviews page uses RequestTabs, not hand-rolled nav', () => {
    const source = readFileSync(join(process.cwd(), 'app/admin/reviews/page.tsx'), 'utf-8');
    expect(source).not.toMatch(/border-b pb-2/);
    expect(source).toMatch(/RequestTabs/);
  });

  it('notifications page uses shadcn Pagination, not hand-rolled buttons', () => {
    const source = readFileSync(join(process.cwd(), 'app/admin/notifications/page.tsx'), 'utf-8');
    expect(source).not.toMatch(/previous.*next/s);
    expect(source).toMatch(/Pagination/);
  });

  it('gift-cards page uses shadcn Accordion, not raw details', () => {
    const source = readFileSync(join(process.cwd(), 'app/admin/gift-cards/page.tsx'), 'utf-8');
    expect(source).not.toMatch(/<details/);
    expect(source).toMatch(/Accordion/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/domain/admin-controls.test.ts`
Expected: FAIL — pages still contain hand-rolled markup

- [ ] **Step 3: Write minimal implementation**

Modify `app/admin/reviews/page.tsx`:

```tsx
import { RequestTabs } from '@/components/admin/RequestTabs';

// Remove: tabLink, tabActive, tabIdle constants and <nav className="mt-4 flex items-center gap-6 border-b pb-2">...</nav>

// Replace return block start:
return (
  <PageHeader eyebrow={t('reviews')} title={t('reviews')} />
  <AutoRefresh />
  <RequestTabs
    basePath="/admin/reviews"
    tabs={[
      { value: 'pending', label: t('pendingRequests', { count: pending.length }) },
      { value: 'approved', label: t('resolvedRequests', { count: approved.length }) },
    ]}
    current={showApproved ? 'approved' : 'pending'}
    paramName="status"
  />
  {rows.length === 0 ? <StatusMessage title={showApproved ? t('noReviews') : t('noPendingReviews')} /> : <Card className="mt-4">...</Card>}
);
```

Modify `app/admin/cancel-requests/page.tsx`:

```tsx
import { RequestTabs } from '@/components/admin/RequestTabs';

// Remove: tabLink, tabActive, tabIdle constants and <nav>...</nav>

// Replace return block start:
return (
  <PageHeader eyebrow={t('customerOrders')} title={t('cancelRequests')} />
  <AutoRefresh />
  <RequestTabs
    basePath="/admin/cancel-requests"
    tabs={[
      { value: 'pending', label: t('pendingRequests', { count: pending.length }) },
      { value: 'resolved', label: t('resolvedRequests', { count: resolved.length }) },
    ]}
    current={showResolved ? 'resolved' : 'pending'}
  />
  ...
);
```

Modify `app/admin/change-requests/page.tsx`:

```tsx
import { RequestTabs } from '@/components/admin/RequestTabs';

// Remove: tabLink, tabActive, tabIdle constants and <nav>...</nav>

// Replace return block start:
return (
  <PageHeader eyebrow={t('customerOrders')} title={t('changeRequests')} />
  <AutoRefresh />
  <RequestTabs
    basePath="/admin/change-requests"
    tabs={[
      { value: 'pending', label: t('pendingRequests', { count: active.length }) },
      { value: 'resolved', label: t('resolvedRequests', { count: resolved.length }) },
    ]}
    current={showResolved ? 'resolved' : 'pending'}
  />
  ...
);
```

Modify `app/admin/notifications/page.tsx`:

```tsx
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from '@/components/ui/pagination';

// Replace hand-rolled pagination block:
// Before:
// <div className="flex flex-wrap items-center justify-between gap-3">
//   <p className="text-sm text-muted-foreground">{t('pageOf', { page: current, pages: pageCount })}</p>
//   <div className="flex items-center gap-2">
//     {current > 1 ? <Button asChild variant="outline" size="sm"><Link href={pageHref(current - 1)}>{t('previous')}</Link></Button> : <Button variant="outline" size="sm" disabled>{t('previous')}</Button>}
//     {current < pageCount ? <Button asChild variant="outline" size="sm"><Link href={pageHref(current + 1)}>{t('next')}</Link></Button> : <Button variant="outline" size="sm" disabled>{t('next')}</Button>}
//   </div>
// </div>

// After:
<div className="mt-4 flex flex-col items-center gap-2">
  <Pagination>
    <PaginationContent>
      {current > 1 && <PaginationItem><PaginationPrevious href={pageHref(current - 1)} /></PaginationItem>}
      {Array.from({ length: pageCount }, (_, i) => i + 1).map((p) => (
        <PaginationItem key={p}>
          <PaginationLink href={pageHref(p)} isActive={p === current}>{p}</PaginationLink>
        </PaginationItem>
      ))}
      {current < pageCount && <PaginationItem><PaginationNext href={pageHref(current + 1)} /></PaginationItem>}
    </PaginationContent>
  </Pagination>
  <p className="text-sm text-muted-foreground">{t('pageOf', { page: current, pages: pageCount })}</p>
</div>
```

Modify `app/admin/gift-cards/page.tsx`:

```tsx
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

// Replace raw details/summary:
// Before:
// <details>
//   <summary className="cursor-pointer text-sm font-medium">{t('giftCardHistory')}</summary>
//   <ul className="mt-2 grid gap-1 text-sm text-muted-foreground">...</ul>
// </details>

// After:
<Accordion type="single" collapsible>
  <AccordionItem value={`history-${card.id}`}>
    <AccordionTrigger>{t('giftCardHistory')}</AccordionTrigger>
    <AccordionContent>
      <ul className="grid gap-1 text-sm text-muted-foreground">
        {transactions.map((transaction, index) => <li key={`${transaction.idempotencyKey}-${index}`}>{transaction.type} · {formatMoney(transaction.amountMinor, locale)}</li>)}
      </ul>
    </AccordionContent>
  </AccordionItem>
</Accordion>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/domain/admin-controls.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/admin/reviews/page.tsx app/admin/cancel-requests/page.tsx app/admin/change-requests/page.tsx app/admin/notifications/page.tsx app/admin/gift-cards/page.tsx tests/domain/admin-controls.test.ts
git commit -m "feat: migrate hand-rolled controls to shadcn Tabs/Pagination/Accordion"
```

---

### Task 8: Unify list card pattern for bare CardContent pages

**Files:**
- Modify: `app/admin/delivery/page.tsx`
- Modify: `app/admin/promos/page.tsx`
- Modify: `app/admin/blog/page.tsx`
- Modify: `app/admin/authors/page.tsx`
- Test: `tests/domain/admin-card-unification.test.ts`

**Interfaces:**
- Consumes: `CardHeader`, `CardTitle` from shadcn
- Produces: unified `<Card><CardHeader><CardTitle>...</CardTitle></CardHeader><CardContent>...</CardContent></Card>` pattern

- [ ] **Step 1: Write the failing test**

Create `tests/domain/admin-card-unification.test.ts`:

```tsx
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const PAGES = [
  'app/admin/delivery/page.tsx',
  'app/admin/promos/page.tsx',
  'app/admin/blog/page.tsx',
  'app/admin/authors/page.tsx',
];

describe('list card unification', () => {
  it.each(PAGES)('$s uses CardHeader + CardTitle', (rel) => {
    const source = readFileSync(join(process.cwd(), rel), 'utf-8');
    expect(source).toMatch(/CardHeader/);
    expect(source).toMatch(/CardTitle/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/domain/admin-card-unification.test.ts`
Expected: FAIL — pages still use bare `CardContent`

- [ ] **Step 3: Write minimal implementation**

Modify `app/admin/delivery/page.tsx`:

```tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

// Before:
// {rows.map((city) => {
//   const rule = city.delivery_rules?.[0];
//   const initial: DeliveryRuleInitial = { ... };
//   return <Card key={city.code}><CardContent className="flex flex-wrap items-baseline gap-x-6 gap-y-3">
//     <strong>{city.name_en}</strong>
//     <span className="text-sm text-muted-foreground">{city.name_ar} · {city.code} · {city.same_day ? t('sameDay') : t('nextDay')} · {rule?.active ? t('active') : t('inactive')}</span>
//     <DeliveryRuleForm cityCode={city.code} initial={initial} />
//   </CardContent></Card>;
// })}

// After:
{rows.map((city) => {
  const rule = city.delivery_rules?.[0];
  const initial: DeliveryRuleInitial = { feeMinor: rule?.fee_minor ?? DEFAULT_FEE_MINOR, minimumOrderMinor: rule?.minimum_order_minor ?? 0, cutoffHour: rule?.cutoff_hour ?? 14, active: rule?.active ?? false };
  return (
    <Card key={city.code}>
      <CardHeader><CardTitle>{city.name_en}</CardTitle></CardHeader>
      <CardContent className="flex flex-wrap items-baseline gap-x-6 gap-y-3">
        <span className="text-sm text-muted-foreground">{city.name_ar} · {city.code} · {city.same_day ? t('sameDay') : t('nextDay')} · {rule?.active ? t('active') : t('inactive')}</span>
        <DeliveryRuleForm cityCode={city.code} initial={initial} />
      </CardContent>
    </Card>
  );
})}
```

Modify `app/admin/promos/page.tsx`:

```tsx
// Before:
// return <Card key={row.code}><CardContent className="grid gap-3">...</CardContent></Card>;

// After:
return (
  <Card key={row.code}>
    <CardHeader><CardTitle>{row.code}</CardTitle></CardHeader>
    <CardContent className="grid gap-3">...</CardContent>
  </Card>
);
```

Modify `app/admin/blog/page.tsx`:

```tsx
// Before:
// return <Card key={row.id}><CardContent className="flex flex-wrap items-center justify-between gap-4">...</CardContent></Card>;

// After:
return (
  <Card key={row.id}>
    <CardHeader><CardTitle>{row.titleEn}</CardTitle></CardHeader>
    <CardContent className="flex flex-wrap items-center justify-between gap-4">...</CardContent>
  </Card>
);
```

Modify `app/admin/authors/page.tsx`:

```tsx
// Before:
// return <Card key={row.id}><CardContent className="flex flex-wrap items-center justify-between gap-4">...</CardContent></Card>;

// After:
return (
  <Card key={row.id}>
    <CardHeader><CardTitle>{row.nameEn}</CardTitle></CardHeader>
    <CardContent className="flex flex-wrap items-center justify-between gap-4">...</CardContent>
  </Card>
);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/domain/admin-card-unification.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/admin/delivery/page.tsx app/admin/promos/page.tsx app/admin/blog/page.tsx app/admin/authors/page.tsx tests/domain/admin-card-unification.test.ts
git commit -m "feat: unify list card pattern with CardHeader + CardTitle"
```

---

### Task 9: Add thumbnails to list pages and image previews to forms

**Files:**
- Modify: `app/admin/products/page.tsx`
- Modify: `app/admin/blog/page.tsx`
- Modify: `app/admin/authors/page.tsx`
- Modify: `components/admin/ProductForm.tsx`
- Modify: `components/admin/AuthorForm.tsx`
- Test: `tests/domain/admin-imagery.test.ts`

**Interfaces:**
- Consumes: `ImagePreview`, `next/image`
- Produces: 48×48 product/blog thumbnails, 32×32 author avatars, 96×96 form previews

- [ ] **Step 1: Write the failing test**

Create `tests/domain/admin-imagery.test.ts`:

```tsx
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('admin imagery', () => {
  it('products list uses ImagePreview for thumbnails', () => {
    const source = readFileSync(join(process.cwd(), 'app/admin/products/page.tsx'), 'utf-8');
    expect(source).toMatch(/ImagePreview/);
  });

  it('blog list uses ImagePreview for cover thumbnails', () => {
    const source = readFileSync(join(process.cwd(), 'app/admin/blog/page.tsx'), 'utf-8');
    expect(source).toMatch(/ImagePreview/);
  });

  it('authors list uses ImagePreview for avatars', () => {
    const source = readFileSync(join(process.cwd(), 'app/admin/authors/page.tsx'), 'utf-8');
    expect(source).toMatch(/ImagePreview/);
  });

  it('ProductForm includes image preview', () => {
    const source = readFileSync(join(process.cwd(), 'components/admin/ProductForm.tsx'), 'utf-8');
    expect(source).toMatch(/ImagePreview/);
  });

  it('AuthorForm includes image preview', () => {
    const source = readFileSync(join(process.cwd(), 'components/admin/AuthorForm.tsx'), 'utf-8');
    expect(source).toMatch(/ImagePreview/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/domain/admin-imagery.test.ts`
Expected: FAIL — files don't yet use ImagePreview

- [ ] **Step 3: Write minimal implementation**

Modify `app/admin/products/page.tsx`:

```tsx
import Image from 'next/image';
import { ImagePreview } from '@/components/admin/ImagePreview';

// Add image_url to select:
// const { data } = await getAdminSupabase().from('products').select('id,slug,name_en,name_ar,price_minor,active,image_url').order('created_at', { ascending: false });

// Update row type:
const rows = (data ?? []) as Array<{ id: string; slug: string; name_en: string; name_ar: string; price_minor: number; active: boolean; image_url: string | null }>;

// In table row, replace first cell with:
<TableCell>
  <div className="flex items-center gap-3">
    <ImagePreview url={product.image_url} kind="product" width={48} height={48} fallback={<span className="text-xs font-medium">{product.name_en[0]?.toUpperCase()}</span>} />
    <Link className="font-medium text-primary underline-offset-4 hover:underline" href={`/admin/products/${product.id}`}>{product.name_en}</Link>
  </div>
</TableCell>
```

Modify `app/admin/blog/page.tsx`:

NOTE: The spec assumes blog posts have a `cover_url` field, but `BlogPostSummary` (returned by `listAllBlogPosts`) does not include `coverUrl`. Extend `adminSelect` in `features/admin/blog-admin.ts:5` to include `cover_url` and extend `BlogPostSummary` type in `features/blog/types.ts` to include `coverUrl?: string`. If the `cover_url` DB column does not exist, fall back to first-letter chip only (no thumbnail).

```tsx
import Image from 'next/image';
import { ImagePreview } from '@/components/admin/ImagePreview';

// In features/admin/blog-admin.ts, update adminSelect:
// const adminSelect = 'id,slug,type,city_code,author_id,title_en,title_ar,title_fr,excerpt_en,excerpt_ar,excerpt_fr,category,published,published_at,updated_at,cover_url';

// In features/blog/types.ts, extend BlogPostSummary:
// coverUrl?: string;

// In app/admin/blog/page.tsx, in CardContent, replace first div with:
<div className="flex items-center gap-3">
  <ImagePreview url={row.coverUrl} kind="cover" width={48} height={48} fallback={<span className="text-sm font-medium">{row.titleEn[0]?.toUpperCase()}</span>} />
  <div className="min-w-0">
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <strong className="truncate">{row.titleEn}</strong>
      ...
```

Modify `app/admin/authors/page.tsx`:

```tsx
import Image from 'next/image';
import { ImagePreview } from '@/components/admin/ImagePreview';

// Add avatarUrl to rows:
// const rows = await listAuthors(getAdminSupabase());

// In CardContent, replace first div with:
<div className="flex items-center gap-3">
  <ImagePreview url={row.avatarUrl} kind="avatar" width={32} height={32} fallback={<span className="text-xs font-medium">{row.nameEn[0]?.toUpperCase()}</span>} />
  <div className="min-w-0">
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1"><strong>{row.nameEn}</strong>{row.roleEn ? <span className="text-sm text-muted-foreground">{row.roleEn}</span> : null}</div>
    ...
```

Modify `components/admin/ProductForm.tsx`:

```tsx
import { ImagePreview } from '@/components/admin/ImagePreview';

// After the existing imageUrl Field, add preview:
<div className="col-span-2 max-md:col-span-1 mt-2">
  <ImagePreview url={product.imageUrl} kind="product" fallback={<span className="text-xs text-muted-foreground">No image</span>} />
</div>
```

Modify `components/admin/AuthorForm.tsx`:

```tsx
import { ImagePreview } from '@/components/admin/ImagePreview';

// After the avatarUrl Input, add preview:
<div className="mt-2">
  <ImagePreview url={avatarUrl} kind="avatar" fallback={<span className="text-xs font-medium">{nameEn[0]?.toUpperCase() ?? '?'}</span>} />
</div>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/domain/admin-imagery.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/admin/products/page.tsx app/admin/blog/page.tsx app/admin/authors/page.tsx components/admin/ProductForm.tsx components/admin/AuthorForm.tsx tests/domain/admin-imagery.test.ts
git commit -m "feat: add thumbnails to list pages and image previews to forms"
```

---

### Task 10: Order detail KeyValueRow migration

**Files:**
- Modify: `app/admin/orders/[id]/page.tsx`
- Test: `tests/domain/admin-order-detail.test.ts`

**Interfaces:**
- Consumes: `KeyValueRow`, `formatDateTime`
- Produces: order detail uses `KeyValueRow` in 3 places

- [ ] **Step 1: Write the failing test**

Create `tests/domain/admin-order-detail.test.ts`:

```tsx
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('order detail KeyValueRow', () => {
  it('uses KeyValueRow for items, payments, and cancel requests', () => {
    const source = readFileSync(join(process.cwd(), 'app/admin/orders/[id]/page.tsx'), 'utf-8');
    const keyValueMatches = source.match(/<KeyValueRow/g) ?? [];
    expect(keyValueMatches.length).toBeGreaterThanOrEqual(3);
  });

  it('uses formatDateTime instead of duplicated ternary', () => {
    const source = readFileSync(join(process.cwd(), 'app/admin/orders/[id]/page.tsx'), 'utf-8');
    expect(source).not.toMatch(/toLocaleString\(locale === 'ar'/);
    expect(source).toMatch(/formatDateTime/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/domain/admin-order-detail.test.ts`
Expected: FAIL — page still uses raw `<p>` rows and duplicated date formatting

- [ ] **Step 3: Write minimal implementation**

Modify `app/admin/orders/[id]/page.tsx`:

```tsx
import { KeyValueRow } from '@/components/admin/KeyValueRow';
import { formatDateTime } from '@/lib/date';

// Replace items card body:
// Before:
// {((order.order_items ?? []) as Array<...>).map((item) => (
//   <p key={item.id} className="flex justify-between gap-4 border-b py-2 text-sm">{item.product_name_en} × {item.quantity}<strong>{formatMoney(item.unit_price_minor, locale)}</strong></p>
// ))}

// After:
{((order.order_items ?? []) as Array<{ id: string; product_name_en: string; unit_price_minor: number; quantity: number }>).map((item) => (
  <KeyValueRow key={item.id} label={`${item.product_name_en} × ${item.quantity}`} value={<strong>{formatMoney(item.unit_price_minor, locale)}</strong>} />
))}

// Replace payments card body:
// Before:
// {((order.payments ?? []) as Array<...>).map((payment) => (
//   <p key={payment.id} className="flex justify-between gap-4 border-b py-2 text-sm">{payment.provider} · {payment.provider_reference ?? 'n/a'}<strong>{formatMoney(payment.amount_minor, locale)} · {payment.status}</strong></p>
// ))}

// After:
{((order.payments ?? []) as Array<{ id: string; provider: string; provider_reference: string | null; amount_minor: number; status: string }>).map((payment) => (
  <KeyValueRow key={payment.id} label={`${payment.provider} · ${payment.provider_reference ?? 'n/a'}`} value={<strong>{formatMoney(payment.amount_minor, locale)} · {payment.status}</strong>} />
))}

// Replace date formatting in cancel requests, deliveries, and timeline:
// Before:
// new Date(request.created_at).toLocaleString(locale === 'ar' ? 'ar-EG' : locale === 'fr' ? 'fr-FR' : 'en-GB')

// After:
// formatDateTime(request.created_at, locale)

// Apply the same replacement to:
// - delivery.created_at (line 78)
// - delivery.sent_at (line 79)
// - event.created_at (line 88)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/domain/admin-order-detail.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/admin/orders/[id]/page.tsx tests/domain/admin-order-detail.test.ts
git commit -m "feat: migrate order detail rows to KeyValueRow and formatDateTime"
```

---

### Task 11: Replace remaining duplicated date formatting across admin

**Files:**
- Modify: `app/admin/reviews/page.tsx`
- Modify: `app/admin/cancel-requests/page.tsx`
- Modify: `app/admin/change-requests/page.tsx`
- Test: update `tests/domain/admin-order-detail.test.ts` or create `tests/domain/admin-date-format.test.ts`

**Interfaces:**
- Consumes: `formatDateTime`
- Produces: no duplicated `new Date(value).toLocaleString(locale === 'ar' ? ...)` ternaries

- [ ] **Step 1: Write the failing test**

Extend `tests/domain/admin-order-detail.test.ts` or create a new test:

```tsx
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const DATE_PAGES = [
  'app/admin/reviews/page.tsx',
  'app/admin/cancel-requests/page.tsx',
  'app/admin/change-requests/page.tsx',
  'app/admin/orders/[id]/page.tsx',
];

describe('no duplicated date formatting', () => {
  it.each(DATE_PAGES)('$s uses formatDateTime', (rel) => {
    const source = readFileSync(join(process.cwd(), rel), 'utf-8');
    expect(source).not.toMatch(/toLocaleString\(locale === 'ar'/);
    expect(source).toMatch(/formatDateTime/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/domain/admin-date-format.test.ts`
Expected: FAIL — pages still contain duplicated ternaries

- [ ] **Step 3: Write minimal implementation**

For each page, replace local `formatDate` / inline `new Date(value).toLocaleString(...)` with `formatDateTime(value, locale)`.

`app/admin/reviews/page.tsx`:
```tsx
// Remove: const date = (value: string) => new Date(value).toLocaleString(...)
// Replace: {date(review.createdAt)} with {formatDateTime(review.createdAt, locale)}
// Replace: {date(review.reviewedAt)} with {formatDateTime(review.reviewedAt, locale)}
```

`app/admin/cancel-requests/page.tsx`:
```tsx
// Remove: function formatDate(value: string, locale: string) { ... }
// Replace: {formatDate(request.createdAt, locale)} with {formatDateTime(request.createdAt, locale)}
// Replace: {formatDate(request.reviewedAt, locale)} with {formatDateTime(request.reviewedAt, locale)}
```

`app/admin/change-requests/page.tsx`:
```tsx
// Remove: function formatDate(value: string, locale: string) { ... }
// Replace: {formatDate(request.createdAt, locale)} with {formatDateTime(request.createdAt, locale)}
// Replace: {formatDate(request.reviewedAt, locale)} with {formatDateTime(request.reviewedAt, locale)}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/domain/admin-date-format.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/admin/reviews/page.tsx app/admin/cancel-requests/page.tsx app/admin/change-requests/page.tsx tests/domain/admin-date-format.test.ts
git commit -m "feat: replace duplicated date formatting with formatDateTime helper"
```

---

### Task 12: Verification gate

**Files:**
- Test: existing test suite
- Commands: `tsc --noEmit`, `npm run build`, `npm run lint`, `git diff --check`, secret scan

**Interfaces:**
- Consumes: all tasks above
- Produces: green gate before merge

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: PASS (existing + new tests)

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: green

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: no errors

- [ ] **Step 5: Whitespace and secret scan**

Run: `git diff --check`
Expected: no whitespace errors

Run: `git diff HEAD | rg -i "(secret|password|api_key|sk_|AKIA)" || echo 'no secrets'`
Expected: `no secrets`

- [ ] **Step 6: E2E screenshots**

Run: `npm run test:e2e` (or equivalent Playwright command from `tests/e2e/rosette.playwright.test.ts`)
Expected: screenshots captured before/after for every admin route at desktop 1280 + mobile 390 widths

- [ ] **Step 7: Final commit (if any remaining fixes)**

```bash
git add -A
git commit -m "chore: admin stitch alignment verification gate"
```

---

## Self-review checklist

- [ ] All 16 findings from spec have a corresponding task
- [ ] No placeholders (TBD, TODO, "implement later") in any step
- [ ] Types match across tasks (e.g., `formatDateTime(value, locale)` signature consistent)
- [ ] All new i18n keys (`cancelRequestApproved`, `cancelRequestRejected`, `changeApplied`, `changeRejected`, `giftCardStatusRedeemed`, `giftCardStatusExpired`, `giftCardStatusCancelled`) are added to `features/i18n/dictionaries.ts` for EN/AR/FR in Task 4 implementation
- [ ] `next.config.ts` remotePatterns already cover `https://*.supabase.co` and `images.unsplash.com` — no change needed for `next/image`
- [ ] `AutoRefresh` left untouched (out of scope)
- [ ] Fragment-spread conditional columns in cancel/change requests left untouched (out of scope)
