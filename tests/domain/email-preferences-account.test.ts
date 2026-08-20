import { describe, expect, it } from 'vitest';
import { setEmailEngagementPreference } from '@/features/account/actions';

describe('setEmailEngagementPreference', () => {
  it('saves the preference for the authenticated customer', async () => {
    const client = { from: () => ({ upsert: async () => ({ error: null }) }) };
    await expect(setEmailEngagementPreference(false, { customer: { id: 'u1', email: 'buyer@example.com', displayName: '', phone: '' }, client })).resolves.toBe('saved');
  });

  it('does not write when unauthenticated', async () => {
    const client = { from: () => ({ upsert: async () => ({ error: null }) }) };
    await expect(setEmailEngagementPreference(true, { customer: null, client })).resolves.toBe('unauthenticated');
  });

  it('returns failure when the preference write fails', async () => {
    const client = { from: () => ({ upsert: async () => ({ error: { message: 'database unavailable' } }) }) };
    await expect(setEmailEngagementPreference(false, { customer: { id: 'u1', email: 'buyer@example.com', displayName: '', phone: '' }, client })).resolves.toBe('failure');
  });
});
