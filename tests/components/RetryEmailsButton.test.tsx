import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../test-utils';

vi.mock('next/navigation', () => ({
  usePathname: () => '/', useRouter: () => ({ refresh: vi.fn() }) }));

import { RetryEmailsButton } from '@/components/admin/RetryEmailsButton';

beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); vi.clearAllMocks(); });

describe('RetryEmailsButton', () => {
  it('posts to the retry endpoint and shows the summary', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, summary: { retried: 3, sent: 2, failed: 1, skipped: 0 } }) });
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<RetryEmailsButton />);
    await userEvent.click(screen.getByRole('button', { name: 'Retry stuck emails' }));
    expect(await screen.findByText(/Retried 3 · sent 2 · failed 1 · skipped 0/)).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/notifications/retry', { method: 'POST' });
  });

  it('shows an error message when the endpoint fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'x' }) }));
    renderWithProviders(<RetryEmailsButton />);
    await userEvent.click(screen.getByRole('button', { name: 'Retry stuck emails' }));
    expect(await screen.findByText("Couldn't retry emails.")).toBeTruthy();
  });
});
