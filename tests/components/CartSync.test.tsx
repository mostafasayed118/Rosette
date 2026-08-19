import { render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CartSync } from '@/features/cart/CartSync';
import { CartProvider } from '@/features/cart/CartProvider';
import { I18nProvider } from '@/features/i18n/I18nProvider';

const auth = vi.hoisted(() => {
  const state = {
    callback: null as ((event: string) => void) | null,
    supabase: {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
        onAuthStateChange: vi.fn((callback: (event: string) => void) => {
          state.callback = callback;
          return { data: { subscription: { unsubscribe: vi.fn() } } };
        }),
      },
    },
  };
  return state;
});

vi.mock('@/lib/supabase/browser', () => ({ getBrowserSupabase: () => auth.supabase }));
vi.mock('next/navigation', () => ({ useParams: () => ({ locale: 'en', city: 'cairo' }) }));

describe('CartSync', () => {
  it('syncs the cart when a signed-in user signs in', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    auth.supabase.auth.getUser.mockResolvedValue({ data: { user: { email: 'a@b.com' } }, error: null });

    render(<I18nProvider><CartProvider><CartSync /></CartProvider></I18nProvider>);
    auth.callback?.('SIGNED_IN');

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/cart/sync', expect.objectContaining({ method: 'POST' })));
    vi.unstubAllGlobals();
  });

  it('does not sync for a signed-out user', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    auth.supabase.auth.getUser.mockResolvedValue({ data: { user: null }, error: null });

    render(<I18nProvider><CartProvider><CartSync /></CartProvider></I18nProvider>);
    auth.callback?.('SIGNED_IN');

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
