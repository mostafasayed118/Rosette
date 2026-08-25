import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WishlistLink } from '@/components/wishlist/WishlistLink';
import { WishlistProvider } from '@/features/wishlist/WishlistProvider';
import { renderWithProviders } from '../test-utils';

vi.mock('@/lib/supabase/browser', () => ({ getBrowserSupabase: () => null }));
vi.mock('next/navigation', () => ({
  usePathname: () => '/', useParams: () => ({ locale: 'en', city: 'cairo' }) }));

describe('WishlistLink', () => {
  it('shows a zero count when nothing is saved', () => {
    localStorage.clear();
    renderWithProviders(<WishlistProvider><WishlistLink /></WishlistProvider>);
    expect(screen.getByRole('link', { name: /wishlist/i })).toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('shows the saved count from localStorage', () => {
    localStorage.setItem('rosette.wishlist.v1', JSON.stringify(['rose-hour', 'citrus-cloud']));
    renderWithProviders(<WishlistProvider><WishlistLink /></WishlistProvider>);
    expect(screen.getByText('2')).toBeInTheDocument();
  });
});
