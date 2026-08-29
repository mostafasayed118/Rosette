import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  adminFrom: vi.fn(),
  getCurrentCustomer: vi.fn().mockResolvedValue(null),
}));

vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('@/lib/supabase/admin', () => ({ getAdminSupabase: () => ({ from: mocks.adminFrom }) }));
vi.mock('@/features/auth/customer', () => ({ getCurrentCustomer: mocks.getCurrentCustomer }));

import { setEmailEngagementPreference } from '@/features/account/actions';
import { setEmailEngagementPreferenceFor } from '@/features/account/action-internals';

const customer = { id: 'cust-1', email: 'buyer@example.com', displayName: 'Buyer', phone: '' };

describe('email-preference server action (remote entry point)', () => {
  it('refuses an anonymous caller before touching the database', async () => {
    expect(await setEmailEngagementPreference(true)).toBe('unauthenticated');
    expect(mocks.adminFrom).not.toHaveBeenCalled();
  });

  it('ignores an injected identity in the payload — session only', async () => {
    // A remote caller could previously pass { customer, client } as the deps
    // argument; the hardened action no longer accepts any identity argument.
    expect(await setEmailEngagementPreference(true, { customer, client: { from: mocks.adminFrom } } as never)).toBe('unauthenticated');
    expect(mocks.adminFrom).not.toHaveBeenCalled();
  });
});

describe('setEmailEngagementPreferenceFor', () => {
  it('rejects a non-boolean enabled flag', async () => {
    const client = { from: vi.fn() };
    expect(await setEmailEngagementPreferenceFor(customer, client as never, 'yes' as never)).toBe('failure');
    expect(client.from).not.toHaveBeenCalled();
  });

  it('saves the preference for the authenticated customer', async () => {
    const client = { from: () => ({ upsert: async () => ({ error: null }) }) };
    expect(await setEmailEngagementPreferenceFor(customer, client as never, false)).toBe('saved');
  });

  it('returns failure when the preference write fails', async () => {
    const client = { from: () => ({ upsert: async () => ({ error: { message: 'database unavailable' } }) }) };
    expect(await setEmailEngagementPreferenceFor(customer, client as never, false)).toBe('failure');
  });
});
