import { describe, expect, it } from 'vitest';
import { isCronAuthorized } from '@/lib/cron';

describe('cron authorization', () => {
  it('authorizes a matching bearer token', () => {
    expect(isCronAuthorized('Bearer abc123', 'abc123')).toBe(true);
  });

  it('rejects a wrong token', () => {
    expect(isCronAuthorized('Bearer nope', 'abc123')).toBe(false);
  });

  it('rejects a missing header', () => {
    expect(isCronAuthorized(null, 'abc123')).toBe(false);
  });
});
