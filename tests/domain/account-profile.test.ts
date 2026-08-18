import { describe, expect, it } from 'vitest';
import { validateProfile, updateProfileRecord } from '@/features/account/profile';

describe('validateProfile', () => {
  it('rejects a blank name', () => {
    expect(validateProfile({ displayName: '   ', phone: '' })).toBe('invalid_name');
  });

  it('trims and accepts a phone-free profile', () => {
    expect(validateProfile({ displayName: ' Nour ', phone: '' })).toBeNull();
  });

  it('rejects an over-long phone', () => {
    expect(validateProfile({ displayName: 'Nour', phone: '0'.repeat(51) })).toBe('invalid_phone');
  });
});

describe('updateProfileRecord', () => {
  it('updates display_name and phone for the given user', async () => {
    let updated: unknown = null;
    const client = {
      from: () => ({
        update: (payload: unknown) => { updated = payload; return { eq: async () => ({ error: null }) }; },
      }),
    } as never;
    const result = await updateProfileRecord(client, 'u1', { displayName: 'Nour', phone: '0100' });
    expect(result).toBe('saved');
    expect(updated).toEqual({ display_name: 'Nour', phone: '0100' });
  });

  it('returns failure on update error', async () => {
    const client = { from: () => ({ update: () => ({ eq: async () => ({ error: { message: 'x' } }) }) }) } as never;
    expect(await updateProfileRecord(client, 'u1', { displayName: 'Nour', phone: '' })).toBe('failure');
  });
});
