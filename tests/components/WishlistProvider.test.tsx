import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WishlistHeart } from '@/components/wishlist/WishlistHeart';
import { WishlistProvider } from '@/features/wishlist/WishlistProvider';
import { renderWithProviders } from '../test-utils';

const auth = vi.hoisted(() => {
  const state = { callback: null as ((event: string) => void) | null };
  const fakeSupabase = {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      onAuthStateChange: vi.fn((callback: (event: string) => void) => {
        state.callback = callback;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }),
    },
  };
  return { fakeSupabase, state };
});

vi.mock('@/lib/supabase/browser', () => ({ getBrowserSupabase: () => auth.fakeSupabase }));
vi.mock('next/navigation', () => ({ useParams: () => ({ locale: 'en', city: 'cairo' }) }));

describe('WishlistProvider', () => {
  it('merges guest saves into the account when the user signs in', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ slugs: ['rose-hour'] }) });
    vi.stubGlobal('fetch', fetchMock);
    localStorage.setItem('rosette.wishlist.v1', JSON.stringify(['rose-hour']));

    renderWithProviders(<WishlistProvider><WishlistHeart slug="rose-hour" /></WishlistProvider>);

    // Guest: heart starts unsaved (localStorage list is pending the merge).
    const button = screen.getByRole('button', { name: /add to wishlist/i });
    expect(button).toHaveAttribute('aria-pressed', 'false');

    // Sign in — the auth callback fires and re-syncs from the server.
    auth.fakeSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
    auth.state.callback?.('SIGNED_IN');

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/account/wishlist/merge', expect.objectContaining({ method: 'POST' }));
    });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /remove from wishlist/i })).toHaveAttribute('aria-pressed', 'true');
    });
    expect(localStorage.getItem('rosette.wishlist.v1')).toBeNull();
    vi.unstubAllGlobals();
  });
});
