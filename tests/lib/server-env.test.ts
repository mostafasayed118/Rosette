import { afterEach, describe, expect, it } from 'vitest';
import { getOptionalServerEnv, getRequiredServerEnv } from '@/lib/server-env';

describe('server environment', () => {
  afterEach(() => {
    delete process.env.GROQ_API_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  it('returns undefined for an optional provider that is not configured', () => {
    expect(getOptionalServerEnv('GROQ_API_KEY')).toBeUndefined();
  });

  it('throws a named error for a required missing secret', () => {
    expect(() => getRequiredServerEnv('SUPABASE_SERVICE_ROLE_KEY')).toThrow(
      'Missing server environment variable: SUPABASE_SERVICE_ROLE_KEY',
    );
  });
});
