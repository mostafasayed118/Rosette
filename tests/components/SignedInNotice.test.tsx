import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../test-utils';

vi.mock('@/lib/supabase/browser', () => ({
  getBrowserSupabase: vi.fn(),
}));

import { getBrowserSupabase } from '@/lib/supabase/browser';
import { SignedInNotice } from '@/features/checkout/SignedInNotice';

const mockGetBrowserSupabase = vi.mocked(getBrowserSupabase);

beforeEach(() => vi.clearAllMocks());

describe('SignedInNotice', () => {
  it('shows the ordering-as line when signed in', async () => {
    mockGetBrowserSupabase.mockReturnValue({ auth: { getUser: async () => ({ data: { user: { id: 'u1', email: 'a@b.c' } } }) } } as never);
    const { container } = renderWithProviders(<SignedInNotice />);
    expect(await screen.findByText(/a@b\.c/)).toBeTruthy();
  });

  it('renders nothing when signed out', async () => {
    mockGetBrowserSupabase.mockReturnValue({ auth: { getUser: async () => ({ data: { user: null } }) } } as never);
    const { container } = renderWithProviders(<SignedInNotice />);
    await Promise.resolve();
    expect(container.textContent).toBe('');
  });
});
