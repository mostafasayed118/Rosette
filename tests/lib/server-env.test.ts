import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getOptionalServerEnv, getRequiredServerEnv } from '@/lib/server-env';

describe('server environment', () => {
  beforeEach(() => {
    // Isolate provider secrets that may be injected by the Codespace/deployment shell.
    vi.stubEnv('GROQ_API_KEY', '');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
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
