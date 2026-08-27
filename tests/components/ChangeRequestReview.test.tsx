import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChangeRequestReview } from '@/components/admin/ChangeRequestReview';
import { renderWithProviders } from '../test-utils';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  usePathname: () => '/', useRouter: () => ({ refresh }) }));

beforeEach(() => refresh.mockClear());

describe('ChangeRequestReview', () => {
  it('posts approve and refreshes', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<ChangeRequestReview requestId="req-1" />);
    fireEvent.click(screen.getByRole('button', { name: /approve/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/admin/change-requests/req-1', expect.objectContaining({ method: 'POST' })));
    const [, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(JSON.parse(init.body)).toEqual({ action: 'approve', reason: undefined });
    expect(refresh).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('posts reject with the typed reason and refreshes', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<ChangeRequestReview requestId="req-1" />);
    fireEvent.change(screen.getByPlaceholderText(/reason for rejection/i), { target: { value: 'too late' } });
    fireEvent.click(screen.getByRole('button', { name: /decline/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(JSON.parse(init.body)).toEqual({ action: 'reject', reason: 'too late' });
    expect(refresh).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('shows an error and does not refresh when the review fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    renderWithProviders(<ChangeRequestReview requestId="req-1" />);
    fireEvent.click(screen.getByRole('button', { name: /approve/i }));
    await waitFor(() => expect(screen.getByText(/couldn't review the change request/i)).toBeInTheDocument());
    expect(refresh).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
