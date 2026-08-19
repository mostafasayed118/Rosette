import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SaveBagField } from '@/features/cart/SaveBagField';
import { I18nProvider } from '@/features/i18n/I18nProvider';
import { CartProvider } from '@/features/cart/CartProvider';

vi.mock('@/lib/supabase/browser', () => ({ getBrowserSupabase: vi.fn() }));
vi.mock('next/navigation', () => ({ useParams: () => ({ locale: 'en', city: 'cairo' }) }));

import { getBrowserSupabase } from '@/lib/supabase/browser';

const fetchMock = vi.fn();

beforeEach(() => { vi.stubGlobal('fetch', fetchMock); fetchMock.mockClear(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('SaveBagField', () => {
  it('renders nothing when Supabase is not configured', () => {
    vi.mocked(getBrowserSupabase).mockReturnValue(null);
    render(<I18nProvider><CartProvider><SaveBagField /></CartProvider></I18nProvider>);
    expect(screen.queryByText('Save your bag so you can finish later.')).toBeNull();
  });

  it('rejects an invalid email', async () => {
    vi.mocked(getBrowserSupabase).mockReturnValue({ auth: {} } as never);
    render(<I18nProvider><CartProvider><SaveBagField /></CartProvider></I18nProvider>);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'nope' } });
    fireEvent.click(screen.getByRole('button', { name: 'Email me my bag' }));
    expect(await screen.findByText('Enter a valid email.')).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts the cart and shows the saved confirmation', async () => {
    vi.mocked(getBrowserSupabase).mockReturnValue({ auth: {} } as never);
    fetchMock.mockResolvedValue({ ok: true });
    render(<I18nProvider><CartProvider><SaveBagField /></CartProvider></I18nProvider>);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Email me my bag' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/cart/sync', expect.objectContaining({ method: 'POST' })));
    expect(await screen.findByText("Saved — we'll hold this for you.")).toBeTruthy();
  });

  it('shows an error when the sync fails', async () => {
    vi.mocked(getBrowserSupabase).mockReturnValue({ auth: {} } as never);
    fetchMock.mockResolvedValue({ ok: false });
    render(<I18nProvider><CartProvider><SaveBagField /></CartProvider></I18nProvider>);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Email me my bag' }));
    expect(await screen.findByText('A temporary error occurred. Please try again.')).toBeTruthy();
  });
});
