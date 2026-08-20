import { describe, expect, it } from 'vitest';
import {
  buildUnsubscribeUrl,
  createPreferenceToken,
  getEngagementPreference,
  normalizeEmail,
  setEngagementPreference,
  verifyPreferenceToken,
} from '@/features/email-preferences/preferences-service';

type PreferenceRow = { email: string; engagement_enabled: boolean } | null;

function fakeClient(row: PreferenceRow, selectError: unknown = null, upsertError: unknown = null) {
  let upserted: unknown = null;
  const client = {
    from: (table: string) => {
      if (table !== 'email_preferences') throw new Error(`unexpected table: ${table}`);
      return {
        select: () => ({
          eq: (_column: string, _value: string) => ({
            maybeSingle: async () => ({ data: row, error: selectError }),
          }),
        }),
        upsert: async (payload: unknown) => {
          upserted = payload;
          return { error: upsertError };
        },
      };
    },
  };
  return { client, getUpserted: () => upserted };
}

describe('email preference service', () => {
  it('normalizes valid email addresses and rejects malformed values', () => {
    expect(normalizeEmail('  Buyer@Example.COM ')).toBe('buyer@example.com');
    expect(normalizeEmail('not-an-email')).toBeNull();
    expect(normalizeEmail('')).toBeNull();
    expect(normalizeEmail(null)).toBeNull();
  });

  it('round-trips an HMAC token and rejects tampered data or secrets', () => {
    const token = createPreferenceToken('buyer@example.com', 'secret');
    expect(verifyPreferenceToken('buyer@example.com', token, 'secret')).toBe('buyer@example.com');
    expect(verifyPreferenceToken('other@example.com', token, 'secret')).toBeNull();
    expect(verifyPreferenceToken('buyer@example.com', `${token}x`, 'secret')).toBeNull();
    expect(verifyPreferenceToken('buyer@example.com', token, 'wrong-secret')).toBeNull();
  });

  it('builds a URL with encoded email, token, and locale', () => {
    const url = buildUnsubscribeUrl('https://rosette.example/', 'Buyer@Example.com', 'secret', 'fr');
    expect(url).toMatch(/^https:\/\/rosette\.example\/api\/email-preferences\/unsubscribe\?/);
    expect(url).toContain('email=buyer%40example.com');
    expect(url).toContain('token=');
    expect(url).toContain('locale=fr');
  });

  it('treats a missing preference row as enabled', async () => {
    const { client } = fakeClient(null);
    await expect(getEngagementPreference(client, 'Buyer@Example.com')).resolves.toEqual({ status: 'enabled' });
  });

  it('returns disabled for an explicit opt-out row', async () => {
    const { client } = fakeClient({ email: 'buyer@example.com', engagement_enabled: false });
    await expect(getEngagementPreference(client, 'buyer@example.com')).resolves.toEqual({ status: 'disabled' });
  });

  it('returns enabled for an explicit opt-in row', async () => {
    const { client } = fakeClient({ email: 'buyer@example.com', engagement_enabled: true });
    await expect(getEngagementPreference(client, 'buyer@example.com')).resolves.toEqual({ status: 'enabled' });
  });

  it('fails closed when the preference read errors', async () => {
    const { client } = fakeClient(null, { message: 'database unavailable' });
    await expect(getEngagementPreference(client, 'buyer@example.com')).resolves.toEqual({ status: 'error' });
  });

  it('writes a normalized preference idempotently', async () => {
    const { client, getUpserted } = fakeClient(null);
    await expect(setEngagementPreference(client, ' Buyer@Example.COM ', false)).resolves.toBe('saved');
    expect(getUpserted()).toMatchObject({ email: 'buyer@example.com', engagement_enabled: false });
  });

  it('returns failure when the preference write errors', async () => {
    const { client } = fakeClient(null, null, { message: 'database unavailable' });
    await expect(setEngagementPreference(client, 'buyer@example.com', false)).resolves.toBe('failure');
  });
});
