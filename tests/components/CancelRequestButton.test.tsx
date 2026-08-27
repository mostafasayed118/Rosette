import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CancelRequestButton } from '@/components/account/CancelRequestButton';
import { renderWithProviders } from '../test-utils';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  usePathname: () => '/', useRouter: () => ({ refresh }) }));

describe('CancelRequestButton', () => {
  it('posts a cancellation request and refreshes on success', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<CancelRequestButton orderId="o1" />);
    fireEvent.change(screen.getByPlaceholderText(/reason/i), { target: { value: 'changed my mind' } });
    fireEvent.click(screen.getByRole('button', { name: /request cancellation/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/account/orders/o1/cancel-request', expect.objectContaining({ method: 'POST' })));
    expect(refresh).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('shows an error when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    renderWithProviders(<CancelRequestButton orderId="o1" />);
    fireEvent.click(screen.getByRole('button', { name: /request cancellation/i }));
    await waitFor(() => expect(screen.getByText(/couldn't request the cancellation/i)).toBeInTheDocument());
    vi.unstubAllGlobals();
  });
});
