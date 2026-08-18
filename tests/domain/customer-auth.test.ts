import { describe, expect, it } from 'vitest';
import { getCurrentCustomer } from '@/features/auth/customer';

function fakeClient(user: { id: string; email: string } | null, profile: { display_name: string | null; phone: string | null } | null) {
  return {
    auth: { getUser: async () => ({ data: { user } }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: profile }) }) }) }),
  } as never;
}

describe('getCurrentCustomer', () => {
  it('returns the user with profile when signed in', async () => {
    const customer = await getCurrentCustomer(fakeClient({ id: 'u1', email: 'a@b.c' }, { display_name: 'Nour', phone: '0100' }));
    expect(customer).toEqual({ id: 'u1', email: 'a@b.c', displayName: 'Nour', phone: '0100' });
  });

  it('returns null without a session', async () => {
    expect(await getCurrentCustomer(fakeClient(null, null))).toBeNull();
  });

  it('returns null when the profile row is missing', async () => {
    expect(await getCurrentCustomer(fakeClient({ id: 'u1', email: 'a@b.c' }, null))).toBeNull();
  });
});
