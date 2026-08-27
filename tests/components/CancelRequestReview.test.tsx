import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CancelRequestReview } from '@/components/admin/CancelRequestReview';
import { renderWithProviders } from '../test-utils';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  usePathname: () => '/', useRouter: () => ({ refresh }) }));

beforeEach(() => refresh.mockClear());

describe('CancelRequestReview', () => {
  it('posts an approve action and refreshes on success', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<CancelRequestReview requestId="req-1" />);
    fireEvent.click(screen.getByRole('button', { name: /approve/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/admin/cancel-requests/req-1', expect.objectContaining({ method: 'POST' })));
    const [url, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(url).toBe('/api/admin/cancel-requests/req-1');
    expect(JSON.parse(init.body)).toEqual({ action: 'approve' });
    expect(refresh).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('sends the typed reason when rejecting', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<CancelRequestReview requestId="req-1" />);
    fireEvent.change(screen.getByPlaceholderText(/reason for rejection/i), { target: { value: 'too late' } });
    fireEvent.click(screen.getByRole('button', { name: /decline/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(JSON.parse(init.body)).toEqual({ action: 'reject', reason: 'too late' });
    vi.unstubAllGlobals();
  });

  it('shows an error when the review fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    renderWithProviders(<CancelRequestReview requestId="req-1" />);
    fireEvent.click(screen.getByRole('button', { name: /approve/i }));
    await waitFor(() => expect(screen.getByText(/couldn't review the cancellation request/i)).toBeInTheDocument());
    expect(refresh).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
