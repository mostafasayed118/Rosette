import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PayDifferenceButton } from '@/components/account/PayDifferenceButton';
import { renderWithProviders } from '../test-utils';

describe('PayDifferenceButton', () => {
  it('opens the checkout URL from the pay route', async () => {
    const open = vi.fn();
    vi.stubGlobal('open', open);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ checkoutUrl: 'https://pay.example/checkout' }) }));
    renderWithProviders(<PayDifferenceButton requestId="req-1" />);
    fireEvent.click(screen.getByRole('button', { name: /pay the difference/i }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/account/change-requests/req-1/pay', expect.objectContaining({ method: 'POST' })));
    expect(open).toHaveBeenCalledWith('https://pay.example/checkout', '_blank');
    vi.unstubAllGlobals();
  });

  it('shows an error when the payment cannot start', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    renderWithProviders(<PayDifferenceButton requestId="req-1" />);
    fireEvent.click(screen.getByRole('button', { name: /pay the difference/i }));
    await waitFor(() => expect(screen.getByText(/could not start the payment/i)).toBeInTheDocument());
    vi.unstubAllGlobals();
  });
});
