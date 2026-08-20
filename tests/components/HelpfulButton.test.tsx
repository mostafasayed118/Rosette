import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HelpfulButton } from '@/components/reviews/HelpfulButton';
import { renderWithProviders } from '../test-utils';

describe('HelpfulButton', () => {
  it('loads and renders the helpful count', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ helpful: 7, voted: false }) });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('crypto', { randomUUID: () => 'visitor-1' });
    renderWithProviders(<HelpfulButton reviewId="rev-1" />);
    const button = await screen.findByRole('button', { name: /helpful/i });
    await waitFor(() => expect(button).toHaveTextContent('7'));
    expect(fetchMock).toHaveBeenCalledWith('/api/reviews/rev-1/vote?visitor=visitor-1');
    vi.unstubAllGlobals();
  });

  it('toggles optimistically and posts the visitor id', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ helpful: 3, voted: false }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ helpful: 4, voted: true }) });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('crypto', { randomUUID: () => 'visitor-1' });
    renderWithProviders(<HelpfulButton reviewId="rev-1" />);
    const button = await screen.findByRole('button', { name: /helpful/i });
    fireEvent.click(button);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/reviews/rev-1/vote', expect.objectContaining({ method: 'POST' })));
    const [, init] = fetchMock.mock.calls[1] as [string, { body: string }];
    expect(JSON.parse(init.body)).toEqual({ visitor: 'visitor-1' });
    await waitFor(() => expect(button).toHaveTextContent('4'));
    vi.unstubAllGlobals();
  });

  it('reverts the optimistic toggle when the request fails', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ helpful: 2, voted: false }) })
      .mockResolvedValueOnce({ ok: false, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('crypto', { randomUUID: () => 'visitor-1' });
    renderWithProviders(<HelpfulButton reviewId="rev-1" />);
    const button = await screen.findByRole('button', { name: /helpful/i });
    fireEvent.click(button);
    await waitFor(() => expect(button).toHaveTextContent('2'));
    vi.unstubAllGlobals();
  });
});
