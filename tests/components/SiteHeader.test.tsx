import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SiteHeader } from '@/components/layout/SiteHeader';

vi.mock('next/navigation', () => ({
  useParams: () => ({ locale: 'en', city: 'greater-cairo' }),
  usePathname: () => '/en/greater-cairo/shop',
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
import { CartProvider } from '@/features/cart/CartProvider';
import { WishlistProvider } from '@/features/wishlist/WishlistProvider';
import { renderWithProviders } from '../test-utils';

function renderHeader() {
  return renderWithProviders(<CartProvider><WishlistProvider><SiteHeader /></WishlistProvider></CartProvider>);
}

describe('SiteHeader', () => {
  it('renders the Stitch center nav with mapped routes', () => {
    renderHeader();
    expect(screen.getByRole('link', { name: 'Collections' })).toHaveAttribute('href', '/en/greater-cairo/shop');
    expect(screen.getByRole('link', { name: 'Bespoke' })).toHaveAttribute('href', '/en/greater-cairo/shop?category=vase-arrangement');
    expect(screen.getByRole('link', { name: 'Atelier' })).toHaveAttribute('href', '/en/greater-cairo/blog');
    expect(screen.getByRole('link', { name: 'Gifts' })).toHaveAttribute('href', '/en/greater-cairo/gift-cards');
  });

  it('keeps the utility cluster: bag, wishlist, language, account, theme', () => {
    renderHeader();
    expect(screen.getAllByRole('link', { name: /bag/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /wishlist|saved/i }).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Toggle theme' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /sign in/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Choose destination' })).toHaveAttribute('href', '/en');
  });

  it('marks the active section with the rose underline', () => {
    renderHeader();
    const collections = screen.getByRole('link', { name: 'Collections' });
    expect(collections.className).toContain('border-primary');
    const gifts = screen.getByRole('link', { name: 'Gifts' });
    expect(gifts.className).not.toContain('border-primary');
  });

  // Regression: the desktop nav plus utility cluster needs ~930px. Showing it
  // from `md` (768px) forced horizontal overflow on every tablet-width page.
  it('keeps the drawer as the nav until the laptop breakpoint', () => {
    renderHeader();
    const nav = document.querySelector('header nav[aria-label]') as HTMLElement;
    const mobileCluster = document.querySelector('header div.lg\\:hidden') as HTMLElement;
    expect(nav.className).toContain('lg:flex');
    expect(nav.className).not.toContain('md:flex');
    expect(mobileCluster).toBeTruthy();
    expect(nav.className).not.toContain('md:hidden');
  });

  it('opens the mobile menu with the Stitch nav items', async () => {
    renderHeader();
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('link', { name: 'Collections' })).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: 'Gifts' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Toggle theme' })).toBeInTheDocument();
  });
});
