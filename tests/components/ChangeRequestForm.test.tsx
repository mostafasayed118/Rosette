import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChangeRequestForm } from '@/components/account/ChangeRequestForm';
import { renderWithProviders } from '../test-utils';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  usePathname: () => '/', useRouter: () => ({ refresh }) }));

const items = [
  { id: 'i1', name: 'Rose bouquet', quantity: 1, giftMessage: '' },
  { id: 'i2', name: 'Vase', quantity: 1, giftMessage: 'hi' },
];

describe('ChangeRequestForm', () => {
  it('posts only the changed fields and refreshes on success', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<ChangeRequestForm orderId="o1" items={items} />);
    fireEvent.change(screen.getByLabelText(/delivery date/i), { target: { value: '2026-08-20' } });
    fireEvent.click(screen.getByRole('button', { name: /request a change/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/account/orders/o1/change-request', expect.objectContaining({ method: 'POST' })));
    const [, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(JSON.parse(init.body)).toEqual({ changes: { delivery_date: '2026-08-20' } });
    expect(refresh).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('includes changed quantities and gift messages in the diff', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<ChangeRequestForm orderId="o1" items={items} />);
    fireEvent.change(screen.getByLabelText(/quantity.*rose bouquet/i), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText(/gift note.*vase/i), { target: { value: 'lots of love' } });
    fireEvent.click(screen.getByRole('button', { name: /request a change/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(JSON.parse(init.body)).toEqual({ changes: { items: [
      { id: 'i1', quantity: 3 },
      { id: 'i2', gift_message: 'lots of love' },
    ] } });
    vi.unstubAllGlobals();
  });

  it('shows an error when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    renderWithProviders(<ChangeRequestForm orderId="o1" items={items} />);
    fireEvent.change(screen.getByLabelText(/delivery date/i), { target: { value: '2026-08-20' } });
    fireEvent.click(screen.getByRole('button', { name: /request a change/i }));
    await waitFor(() => expect(screen.getByText(/could not request the change/i)).toBeInTheDocument());
    vi.unstubAllGlobals();
  });
});
