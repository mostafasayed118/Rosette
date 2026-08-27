import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isUpstashConfigured } from '@/lib/rate-limit-upstash';
import { checkRateLimit, resetRateLimits } from '@/lib/rate-limit';

const fetchMock = vi.hoisted(() => vi.fn());

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  resetRateLimits();
});

describe('upstash rate limit engine', () => {
  it('is inactive without REST credentials', () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');
    expect(isUpstashConfigured()).toBe(false);
  });

  it('shares a fixed window through the Upstash pipeline', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://upstash.example');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'tok');
    fetchMock.mockResolvedValue({ ok: true, json: async () => ([{ result: 2 }, { result: 54_321 }]) });

    const result = await checkRateLimit({ bucket: 'chat', identifier: '1.2.3.4', limit: 5, windowMs: 60_000 });

    expect(result).toMatchObject({ allowed: true, remaining: 3 });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://upstash.example/pipeline');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual([['INCR', 'rl:chat:1.2.3.4'], ['PEXPIRE', 'rl:chat:1.2.3.4', '60000']]);
  });

  it('blocks and reports retryAfterSeconds from the stored TTL', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://upstash.example');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'tok');
    fetchMock.mockResolvedValue({ ok: true, json: async () => ([{ result: 6 }, { result: 30_000 }]) });

    const result = await checkRateLimit({ bucket: 'chat', identifier: '5.6.7.8', limit: 5, windowMs: 60_000 });

    expect(result.allowed).toBe(false);
    expect(result.retryAfterSeconds).toBe(30);
  });

  it('falls back to the memory engine when Upstash is unreachable', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://upstash.example');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'tok');
    fetchMock.mockRejectedValue(new Error('down'));

    const first = await checkRateLimit({ bucket: 'chat', identifier: '9.9.9.9', limit: 2, windowMs: 60_000 });
    expect(first.allowed).toBe(true);
    const second = await checkRateLimit({ bucket: 'chat', identifier: '9.9.9.9', limit: 2, windowMs: 60_000 });
    expect(second.remaining).toBe(0);
    const third = await checkRateLimit({ bucket: 'chat', identifier: '9.9.9.9', limit: 2, windowMs: 60_000 });
    expect(third.allowed).toBe(false);
  });
});
