import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Toaster } from '@/components/ui/sonner';
import { ProductForm } from '@/components/admin/ProductForm';
import { SetQuantityForm } from '@/components/admin/SetQuantityForm';
import { renderWithProviders } from '../test-utils';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

describe('admin form toasts', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows a success toast when a product is saved', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    renderWithProviders(<><ProductForm /><Toaster /></>);
    await user.click(screen.getByRole('button', { name: /create product/i }));
    await waitFor(() => expect(screen.getByText('Product saved.')).toBeInTheDocument());
  });

  it('shows an error toast when a product save fails', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    renderWithProviders(<><ProductForm /><Toaster /></>);
    await user.click(screen.getByRole('button', { name: /create product/i }));
    await waitFor(() => expect(screen.getByText(/could not save the product/i)).toBeInTheDocument());
  });

  it('shows a success toast when stock is updated', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    renderWithProviders(<><SetQuantityForm variantId="v1" current={5} /><Toaster /></>);
    await user.click(screen.getByRole('button', { name: /set/i }));
    await waitFor(() => expect(screen.getByText('Stock updated.')).toBeInTheDocument());
  });
});
