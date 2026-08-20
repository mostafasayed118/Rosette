import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ReviewForm } from '@/components/reviews/ReviewForm';
import { renderWithProviders } from '../test-utils';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

describe('ReviewForm', () => {
  it('submits the selected rating and body, then shows the pending message', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<ReviewForm productSlug="rose-hour" state="can-review" />);
    fireEvent.click(screen.getByRole('button', { name: /4 out of 5/i }));
    fireEvent.change(screen.getByPlaceholderText(/how was it/i), { target: { value: 'Gorgeous' } });
    fireEvent.click(screen.getByRole('button', { name: /submit review/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/account/products/rose-hour/reviews', expect.objectContaining({ method: 'POST' })));
    const [, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(JSON.parse(init.body)).toEqual({ rating: 4, body: 'Gorgeous', photos: [] });
    expect(await screen.findByText(/pending approval/i)).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it('shows the already-reviewed notice instead of the form', () => {
    renderWithProviders(<ReviewForm productSlug="rose-hour" state="already-reviewed" />);
    expect(screen.getByText(/reviewed this product/i)).toBeInTheDocument();
  });

  it('shows the verified-purchase notice for unverified customers', () => {
    renderWithProviders(<ReviewForm productSlug="rose-hour" state="not-verified" />);
    expect(screen.getByText(/verified purchases/i)).toBeInTheDocument();
  });

  it('uploads photos via the photos route then includes their URLs in the review submit', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ urls: ['https://x.supabase.co/storage/v1/object/public/review-images/p1.jpg'] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<ReviewForm productSlug="rose-hour" state="can-review" />);
    fireEvent.click(screen.getByRole('button', { name: /4 out of 5/i }));
    fireEvent.change(screen.getByPlaceholderText(/how was it/i), { target: { value: 'Gorgeous' } });
    const file = new File(['abc'], 'photo.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByLabelText(/add photos/i), { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: /submit review/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/account/review-photos', expect.objectContaining({ method: 'POST' })));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/account/products/rose-hour/reviews', expect.objectContaining({ method: 'POST' })));
    const [, reviewInit] = fetchMock.mock.calls[1] as [string, { body: string }];
    expect(JSON.parse(reviewInit.body)).toEqual({ rating: 4, body: 'Gorgeous', photos: ['https://x.supabase.co/storage/v1/object/public/review-images/p1.jpg'] });
    vi.unstubAllGlobals();
  });

  it('shows the photo error and does not submit when the upload fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'too_large' }) });
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<ReviewForm productSlug="rose-hour" state="can-review" />);
    fireEvent.click(screen.getByRole('button', { name: /4 out of 5/i }));
    fireEvent.change(screen.getByPlaceholderText(/how was it/i), { target: { value: 'Gorgeous' } });
    fireEvent.change(screen.getByLabelText(/add photos/i), { target: { files: [new File(['abc'], 'photo.jpg', { type: 'image/jpeg' })] } });
    fireEvent.click(screen.getByRole('button', { name: /submit review/i }));
    expect(await screen.findByText(/couldn't upload photos/i)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalledWith('/api/account/products/rose-hour/reviews', expect.anything());
    vi.unstubAllGlobals();
  });
});
