import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkRateLimit, getClientIp, resetRateLimits } from '@/lib/rate-limit';

beforeEach(() => resetRateLimits());
afterEach(() => {
  vi.useRealTimers();
  resetRateLimits();
});

function request(headers: Record<string, string>): Request {
  return new Request('https://rosette.test/api/chat', { headers });
}

// checkRateLimit resolves through the Upstash engine only when REST
// credentials exist; the test environment has none, so every call below
// exercises the in-isolate memory engine that production falls back to.
describe('checkRateLimit', () => {
  it('allows requests below the limit and counts down remaining', async () => {
    const first = await checkRateLimit({ bucket: 'chat', identifier: '1.1.1.1', limit: 3, windowMs: 60_000 });
    expect(first).toMatchObject({ allowed: true, remaining: 2 });
    expect((await checkRateLimit({ bucket: 'chat', identifier: '1.1.1.1', limit: 3, windowMs: 60_000 })).remaining).toBe(1);
    expect((await checkRateLimit({ bucket: 'chat', identifier: '1.1.1.1', limit: 3, windowMs: 60_000 })).remaining).toBe(0);
  });

  it('blocks once the limit is reached and reports retryAfterSeconds', async () => {
    for (let attempt = 0; attempt < 2; attempt += 1) await checkRateLimit({ bucket: 'chat', identifier: '2.2.2.2', limit: 2, windowMs: 60_000 });
    const blocked = await checkRateLimit({ bucket: 'chat', identifier: '2.2.2.2', limit: 2, windowMs: 60_000 });
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it('allows again after the window elapses', async () => {
    vi.useFakeTimers();
    await checkRateLimit({ bucket: 'chat', identifier: '3.3.3.3', limit: 1, windowMs: 1_000 });
    expect((await checkRateLimit({ bucket: 'chat', identifier: '3.3.3.3', limit: 1, windowMs: 1_000 })).allowed).toBe(false);
    vi.advanceTimersByTime(1_001);
    expect((await checkRateLimit({ bucket: 'chat', identifier: '3.3.3.3', limit: 1, windowMs: 1_000 })).allowed).toBe(true);
  });

  it('keeps separate buckets independent', async () => {
    await checkRateLimit({ bucket: 'chat', identifier: '4.4.4.4', limit: 1, windowMs: 60_000 });
    expect((await checkRateLimit({ bucket: 'orders', identifier: '4.4.4.4', limit: 1, windowMs: 60_000 })).allowed).toBe(true);
  });

  it('keeps separate identifiers independent', async () => {
    await checkRateLimit({ bucket: 'chat', identifier: '5.5.5.5', limit: 1, windowMs: 60_000 });
    expect((await checkRateLimit({ bucket: 'chat', identifier: '6.6.6.6', limit: 1, windowMs: 60_000 })).allowed).toBe(true);
  });

  it('prunes expired entries so the store cannot grow without bound', async () => {
    vi.useFakeTimers();
    for (let index = 0; index < 25; index += 1) {
      await checkRateLimit({ bucket: 'chat', identifier: `ip-${index}`, limit: 5, windowMs: 1_000 });
    }
    vi.advanceTimersByTime(1_500);
    const result = await checkRateLimit({ bucket: 'chat', identifier: 'fresh', limit: 5, windowMs: 1_000 });
    expect(result.allowed).toBe(true);
    // A pruning pass ran, so the store only tracks the live window.
    expect((await checkRateLimit({ bucket: 'chat', identifier: 'ip-0', limit: 5, windowMs: 1_000 })).remaining).toBe(4);
  });
});

describe('getClientIp', () => {
  it('prefers CF-Connecting-IP', () => {
    expect(getClientIp(request({ 'CF-Connecting-IP': '9.9.9.9', 'X-Forwarded-For': '8.8.8.8', 'X-Real-IP': '7.7.7.7' }))).toBe('9.9.9.9');
  });

  it('does not trust client-supplied forwarded headers', () => {
    expect(getClientIp(request({ 'X-Forwarded-For': '8.8.8.8, 10.0.0.1', 'X-Real-IP': '7.7.7.7' }))).toBe('unknown');
  });

  it('returns unknown when no forwarding headers are present', () => {
    expect(getClientIp(request({}))).toBe('unknown');
  });
});

