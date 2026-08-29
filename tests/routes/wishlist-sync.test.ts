import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
  getServerSupabase: vi.fn(),
}));

vi.mock('@/features/personalization/wishlist-sync', () => ({
  syncWishlistOnLogin: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true, remaining: 0, retryAfterSeconds: 0 })),
  getClientIp: vi.fn(() => 'ip'),
  resetRateLimits: vi.fn(),
}));

const { createClient } = await import('@/lib/supabase/server');
const { syncWishlistOnLogin } = await import('@/features/personalization/wishlist-sync');
const { logger } = await import('@/lib/logger');
const { checkRateLimit } = await import('@/lib/rate-limit');
const { POST, __resetRateLimits } = await import('@/app/api/wishlist/sync/route');

const mockCreateClient = vi.mocked(createClient);
const mockSync = vi.mocked(syncWishlistOnLogin);
const mockLogger = vi.mocked(logger);
const mockCheckRateLimit = vi.mocked(checkRateLimit);

beforeEach(() => {
  vi.clearAllMocks();
  __resetRateLimits();
  mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 0, retryAfterSeconds: 0 });
  mockSync.mockResolvedValue({ synced: 1 } as any);
});

function authedClient(userId = 'uid') {
  return {
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: userId } } })) },
  } as any;
}

function anonClient() {
  return {
    auth: { getUser: vi.fn(async () => ({ data: { user: null } })) },
  } as any;
}

describe('POST /api/wishlist/sync', () => {
  it('returns 401 for anonymous', async () => {
    mockCreateClient.mockResolvedValue(anonClient());
    const req = new Request('http://test/api/wishlist/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slugs: ['rose-hour'] }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
    expect(mockSync).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid body - not array', async () => {
    mockCreateClient.mockResolvedValue(authedClient());
    const req = new Request('http://test/api/wishlist/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slugs: 'not-array' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('invalid_payload');
  });

  it('returns 400 for slugs >50', async () => {
    mockCreateClient.mockResolvedValue(authedClient());
    const many = Array.from({ length: 51 }, (_, i) => `slug-${i}`);
    const req = new Request('http://test/api/wishlist/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slugs: many }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 for slug >80 chars', async () => {
    mockCreateClient.mockResolvedValue(authedClient());
    const long = 'a'.repeat(81);
    const req = new Request('http://test/api/wishlist/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slugs: [long] }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 200 and {synced} for authed with valid slugs', async () => {
    mockCreateClient.mockResolvedValue(authedClient('uid-123'));
    mockSync.mockResolvedValue({ synced: 2 } as any);
    const req = new Request('http://test/api/wishlist/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slugs: ['rose-hour', 'sunlit-stems'] }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ synced: 2 });
    expect(mockSync).toHaveBeenCalledWith(expect.anything(), 'uid-123', ['rose-hour', 'sunlit-stems']);
    expect(mockLogger.info).toHaveBeenCalledWith('wishlist.sync.served', expect.objectContaining({ customerId: 'uid-123', synced: 2 }));
  });

  it('handles empty slugs array', async () => {
    mockCreateClient.mockResolvedValue(authedClient());
    mockSync.mockResolvedValue({ synced: 0 } as any);
    const req = new Request('http://test/api/wishlist/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slugs: [] }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ synced: 0 });
  });

  it('rate-limits after 10/min per user (429)', async () => {
    mockCreateClient.mockResolvedValue(authedClient('rate-user'));
    mockSync.mockResolvedValue({ synced: 1 } as any);
    // First 10 calls are allowed, 11th is denied.
    let calls = 0;
    mockCheckRateLimit.mockImplementation(async () => {
      calls += 1;
      if (calls > 10) return { allowed: false, remaining: 0, retryAfterSeconds: 60 };
      return { allowed: true, remaining: 10 - calls, retryAfterSeconds: 0 };
    });
    const makeReq = () =>
      new Request('http://test/api/wishlist/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slugs: ['rose-hour'] }),
      });

    for (let i = 0; i < 10; i++) {
      const r = await POST(makeReq());
      expect(r.status).toBe(200);
    }
    const limited = await POST(makeReq());
    expect(limited.status).toBe(429);
    const body = await limited.json();
    expect(body.error).toBe('rate_limited');
  });

  it('different users have isolated rate limits', async () => {
    mockSync.mockResolvedValue({ synced: 1 } as any);
    const makeReq = () =>
      new Request('http://test/api/wishlist/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slugs: ['rose-hour'] }),
      });

    mockCreateClient.mockResolvedValue(authedClient('user-a'));
    expect((await POST(makeReq())).status).toBe(200);
    // user-b should still succeed
    mockCreateClient.mockResolvedValue(authedClient('user-b'));
    expect((await POST(makeReq())).status).toBe(200);
  });

  it('logs and returns 500 on sync failure', async () => {
    mockCreateClient.mockResolvedValue(authedClient());
    mockSync.mockRejectedValue(new Error('db error'));
    const req = new Request('http://test/api/wishlist/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slugs: ['rose-hour'] }),
    });
    const res = await POST(req);
    expect(res.status).toBe(500);
    expect(mockLogger.error).toHaveBeenCalled();
  });
});
