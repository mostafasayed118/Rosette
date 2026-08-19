import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SiteHeader } from '@/components/layout/SiteHeader';

vi.mock('next/navigation', () => ({
  useParams: () => ({ locale: 'en', city: 'greater-cairo' }),
  usePathname: () => '/en/greater-cairo',
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
import { CartProvider } from '@/features/cart/CartProvider';
import { WishlistProvider } from '@/features/wishlist/WishlistProvider';
import { renderWithProviders } from '../test-utils';

describe('SiteHeader', () => {
  it('renders shop, track, and bag links', () => {
    renderWithProviders(<CartProvider><WishlistProvider><SiteHeader /></WishlistProvider></CartProvider>);
    expect(screen.getAllByRole('link', { name: /shop the collection/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /track order/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /bag/i }).length).toBeGreaterThan(0);
  });

  it('opens the mobile menu with navigation and controls', async () => {
    renderWithProviders(<CartProvider><WishlistProvider><SiteHeader /></WishlistProvider></CartProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('link', { name: /shop the collection/i })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Toggle theme' })).toBeInTheDocument();
  });
});
