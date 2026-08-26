import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { WishlistHeart } from '@/components/wishlist/WishlistHeart';
import { WishlistProvider } from '@/features/wishlist/WishlistProvider';
import { renderWithProviders } from '../test-utils';

const SYNC_FLAG_KEY = 'rosette.wishlist.synced.v1';

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
vi.mock('next/navigation', () => ({
  usePathname: () => '/', useParams: () => ({ locale: 'en', city: 'cairo' }) }));

beforeEach(() => {
  window.sessionStorage.removeItem(SYNC_FLAG_KEY);
  localStorage.clear();
  vi.unstubAllGlobals();
});

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
  });

  it('POSTs the post-merge wishlist to /api/wishlist/sync exactly once on login', async () => {
    // Regression for C-01: a signed-in user with no guest saves whose merge
    // returns a non-empty canonical list. The sync effect must run after the
    // merge response populates the canonical snapshot, not before.
    const mergeBody = { slugs: ['rose-hour', 'lily'] };
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : (input as URL).toString();
      if (url === '/api/account/wishlist/merge') {
        return Promise.resolve({ ok: true, json: async () => mergeBody });
      }
      if (url === '/api/wishlist/sync') {
        return Promise.resolve({ ok: true, json: async () => ({ ok: true }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    vi.stubGlobal('fetch', fetchMock);
    // No localStorage seed — saved starts empty pre-merge so the effect would
    // skip if it captured `saved` synchronously after setUserId.

    renderWithProviders(<WishlistProvider><WishlistHeart slug="rose-hour" /></WishlistProvider>);

    auth.fakeSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
    auth.state.callback?.('SIGNED_IN');

    // Wait for the merge to complete first; the sync effect runs after.
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/account/wishlist/merge', expect.objectContaining({ method: 'POST' }));
    });
    await waitFor(() => {
      const syncCalls = fetchMock.mock.calls.filter(([u]) => (typeof u === 'string' ? u : (u as URL).toString()) === '/api/wishlist/sync');
      expect(syncCalls.length).toBe(1);
    });
    const syncCall = fetchMock.mock.calls.find(([u]) => (typeof u === 'string' ? u : (u as URL).toString()) === '/api/wishlist/sync');
    expect(syncCall).toBeDefined();
    const init = syncCall?.[1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ slugs: mergeBody.slugs });
    expect(sessionStorage.getItem(SYNC_FLAG_KEY)).toBe('1');
  });

  it('does not POST again on a second render once the session flag is set', async () => {
    sessionStorage.setItem(SYNC_FLAG_KEY, '1');
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : (input as URL).toString();
      if (url === '/api/account/wishlist/merge') {
        return Promise.resolve({ ok: true, json: async () => ({ slugs: ['rose-hour'] }) });
      }
      if (url === '/api/wishlist/sync') {
        return Promise.resolve({ ok: true, json: async () => ({ ok: true }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    vi.stubGlobal('fetch', fetchMock);
    localStorage.setItem('rosette.wishlist.v1', JSON.stringify(['rose-hour']));

    renderWithProviders(<WishlistProvider><WishlistHeart slug="rose-hour" /></WishlistProvider>);
    auth.fakeSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
    auth.state.callback?.('SIGNED_IN');

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/account/wishlist/merge', expect.objectContaining({ method: 'POST' }));
    });
    // Give the sync effect a chance to fire; it should be skipped.
    await new Promise((r) => setTimeout(r, 50));
    const syncCalls = fetchMock.mock.calls.filter(([u]) => (typeof u === 'string' ? u : (u as URL).toString()) === '/api/wishlist/sync');
    expect(syncCalls.length).toBe(0);
  });

  it('does not POST when the user is signed out', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    localStorage.setItem('rosette.wishlist.v1', JSON.stringify(['rose-hour']));

    renderWithProviders(<WishlistProvider><WishlistHeart slug="rose-hour" /></WishlistProvider>);
    // No auth callback — user stays signed out (getUser returns null user).
    await new Promise((r) => setTimeout(r, 50));
    const syncCalls = fetchMock.mock.calls.filter(([u]) => (typeof u === 'string' ? u : (u as URL).toString()) === '/api/wishlist/sync');
    expect(syncCalls.length).toBe(0);
  });

  it('does not set the session flag when the sync response is not ok, and clears it for retry', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : (input as URL).toString();
      if (url === '/api/account/wishlist/merge') {
        return Promise.resolve({ ok: true, json: async () => ({ slugs: ['rose-hour'] }) });
      }
      if (url === '/api/wishlist/sync') {
        return Promise.resolve({ ok: false, status: 500, json: async () => ({ error: 'boom' }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    vi.stubGlobal('fetch', fetchMock);
    localStorage.setItem('rosette.wishlist.v1', JSON.stringify(['rose-hour']));

    renderWithProviders(<WishlistProvider><WishlistHeart slug="rose-hour" /></WishlistProvider>);
    auth.fakeSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
    auth.state.callback?.('SIGNED_IN');

    await waitFor(() => {
      const syncCalls = fetchMock.mock.calls.filter(([u]) => (typeof u === 'string' ? u : (u as URL).toString()) === '/api/wishlist/sync');
      expect(syncCalls.length).toBeGreaterThanOrEqual(1);
    });
    // Wait for the .then() promise to resolve so the flag handler runs.
    await new Promise((r) => setTimeout(r, 50));
    expect(sessionStorage.getItem(SYNC_FLAG_KEY)).toBeNull();
  });
});
