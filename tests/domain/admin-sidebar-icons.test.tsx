import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppSidebar } from '@/components/admin/AppSidebar';
import { SidebarProvider } from '@/components/ui/sidebar';

vi.stubGlobal(
  'matchMedia',
  vi.fn().mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }),
);

afterEach(() => {
  vi.unstubAllGlobals();
});

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
  it('renders a link for every nav item', () => {
    render(
      <SidebarProvider>
        <AppSidebar items={ITEMS} />
      </SidebarProvider>,
    );
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(ITEMS.length);
  });
});
