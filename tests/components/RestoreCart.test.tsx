import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RestoreCart } from '@/features/cart/RestoreCart';
import { CartProvider, useCart } from '@/features/cart/CartProvider';
import { I18nProvider } from '@/features/i18n/I18nProvider';
import type { CartLine } from '@/features/cart/types';

const restored: CartLine = { id: 'l1', productSlug: 'rose-hour', productName: 'Rose Hour', tone: '#bc6d63', unitPrice: 12000, quantity: 1, addOns: [], message: '', deliveryDate: '2026-08-20' };
const local: CartLine = { ...restored, id: 'l2', productSlug: 'citrus-cloud', productName: 'Citrus Cloud' };

const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useParams: () => ({ locale: 'en', city: 'cairo' }),
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams('restore=t1'),
}));
vi.mock('@/lib/supabase/browser', () => ({ getBrowserSupabase: () => ({ auth: {} }) }));

function CartProbe() {
  const { cart } = useCart();
  return <span data-testid="slug">{cart.lines[0]?.productSlug ?? ''}</span>;
}

const fetchMock = vi.fn();

beforeEach(() => { vi.stubGlobal('fetch', fetchMock); fetchMock.mockClear(); replace.mockClear(); localStorage.clear(); });
afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

describe('RestoreCart', () => {
  it('restores into an empty bag', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ lines: [restored] }) });
    render(<I18nProvider><CartProvider><RestoreCart /><CartProbe /></CartProvider></I18nProvider>);
    await waitFor(() => expect(screen.getByTestId('slug')).toHaveTextContent('rose-hour'));
    expect(fetchMock).toHaveBeenCalledWith('/api/cart/restore?token=t1');
    expect(replace).toHaveBeenCalled();
  });

  it('prompts then restores when the bag already has items', async () => {
    localStorage.setItem('rosette.cart.v1', JSON.stringify({ lines: [local], version: 1 }));
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ lines: [restored] }) });
    render(<I18nProvider><CartProvider><RestoreCart /><CartProbe /></CartProvider></I18nProvider>);
    expect(await screen.findByText('Restore your saved bag?')).toBeTruthy();
    expect(screen.getByTestId('slug')).toHaveTextContent('citrus-cloud');
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    await waitFor(() => expect(screen.getByTestId('slug')).toHaveTextContent('rose-hour'));
  });
});
