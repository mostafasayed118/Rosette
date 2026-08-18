import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from './test-utils';

vi.mock('@/lib/supabase/browser', () => ({
  getBrowserSupabase: vi.fn(),
}));

import { getBrowserSupabase } from '@/lib/supabase/browser';
import { AccountNavItem } from '@/components/layout/AccountNavItem';

const mockGetBrowserSupabase = vi.mocked(getBrowserSupabase);

beforeEach(() => vi.clearAllMocks());

describe('AccountNavItem', () => {
  it('shows "Sign in" when signed out', async () => {
    mockGetBrowserSupabase.mockReturnValue({ auth: { getUser: async () => ({ data: { user: null } }) } } as never);
    renderWithProviders(<AccountNavItem />);
    expect(await screen.findByText('Sign in')).toBeTruthy();
    expect(screen.getByText('Sign in').closest('a')).toHaveAttribute('href', '/account/login');
  });

  it('shows "Account" when signed in', async () => {
    mockGetBrowserSupabase.mockReturnValue({ auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) } } as never);
    renderWithProviders(<AccountNavItem />);
    expect(await screen.findByText('Account')).toBeTruthy();
    expect(screen.getByText('Account').closest('a')).toHaveAttribute('href', '/account');
  });
});
