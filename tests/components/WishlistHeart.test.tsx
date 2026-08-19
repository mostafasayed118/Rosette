import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { WishlistHeart } from '@/components/wishlist/WishlistHeart';
import { WishlistProvider } from '@/features/wishlist/WishlistProvider';
import { renderWithProviders } from '../test-utils';

vi.mock('@/lib/supabase/browser', () => ({ getBrowserSupabase: () => null }));

function renderHeart() {
  return renderWithProviders(<WishlistProvider><WishlistHeart slug="rose-hour" /></WishlistProvider>);
}

describe('WishlistHeart', () => {
  beforeEach(() => localStorage.clear());

  it('starts unsaved and toggles to saved in localStorage for guests', async () => {
    renderHeart();
    const button = screen.getByRole('button', { name: /add to wishlist/i });
    expect(button).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(button);
    expect(screen.getByRole('button', { name: /remove from wishlist/i })).toHaveAttribute('aria-pressed', 'true');
    expect(JSON.parse(localStorage.getItem('rosette.wishlist.v1') ?? '[]')).toEqual(['rose-hour']);
  });

  it('toggles back to unsaved on a second click', async () => {
    renderHeart();
    fireEvent.click(screen.getByRole('button', { name: /add to wishlist/i }));
    fireEvent.click(screen.getByRole('button', { name: /remove from wishlist/i }));
    expect(screen.getByRole('button', { name: /add to wishlist/i })).toHaveAttribute('aria-pressed', 'false');
    expect(JSON.parse(localStorage.getItem('rosette.wishlist.v1') ?? '[]')).toEqual([]);
  });
});
