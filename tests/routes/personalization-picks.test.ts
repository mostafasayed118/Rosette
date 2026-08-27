import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
  getServerSupabase: vi.fn(),
}));

vi.mock('@/features/personalization/provider', () => ({
  getPersonalizationProvider: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

const { createClient } = await import('@/lib/supabase/server');
const { getPersonalizationProvider } = await import('@/features/personalization/provider');
const { logger } = await import('@/lib/logger');
const { GET } = await import('@/app/api/personalization/picks/route');

const mockCreateClient = vi.mocked(createClient);
const mockGetProvider = vi.mocked(getPersonalizationProvider);
const mockLogger = vi.mocked(logger);

function makePicks(overrides: Partial<{ buyAgain: any[]; recommended: any[]; reason: 'history' | 'fallback' }> = {}) {
  return {
    buyAgain: overrides.buyAgain ?? [{ slug: 'rose-hour', name: 'Rose Hour' } as any],
    recommended: overrides.recommended ?? [{ slug: 'sunlit-stems', name: 'Sunlit' } as any],
    reason: (overrides.reason ?? 'history') as 'history' | 'fallback',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.ROSETTE_PERSONALIZATION_ENABLED;
  mockGetProvider.mockResolvedValue({
    getPicks: vi.fn(async () => makePicks()),
  } as any);
});

describe('GET /api/personalization/picks', () => {
  it('returns 200 for authed user with valid limit', async () => {
    mockCreateClient.mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'uid' } } })) },
    } as any);

    const req = new Request('http://test/api/personalization/picks?limit=2');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.buyAgain).toBeDefined();
    expect(body.recommended).toBeDefined();
    expect(res.headers.get('Cache-Control')).toBe('private, max-age=60');
    expect(res.headers.get('ETag')).toContain('uid');
    expect(mockLogger.info).toHaveBeenCalledWith('personalization.picks.served', expect.objectContaining({ customerId: 'uid' }));
  });

  it('returns 401 for anonymous with fallback shape and private max-age 0', async () => {
    mockCreateClient.mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: null } })) },
    } as any);

    const req = new Request('http://test/api/personalization/picks?limit=2');
    const res = await GET(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ buyAgain: [], recommended: [], reason: 'fallback' });
    expect(res.headers.get('Cache-Control')).toBe('private, max-age=0');
  });

  it('returns 400 for invalid limit', async () => {
    mockCreateClient.mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'uid' } } })) },
    } as any);
    const req = new Request('http://test/api/personalization/picks?limit=99');
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('invalid_query');
  });

  it('returns 400 for invalid locale', async () => {
    mockCreateClient.mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'uid' } } })) },
    } as any);
    const req = new Request('http://test/api/personalization/picks?locale=xx');
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 for excludeSlug too long (>80)', async () => {
    mockCreateClient.mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'uid' } } })) },
    } as any);
    const long = 'a'.repeat(81);
    const req = new Request(`http://test/api/personalization/picks?excludeSlug=${long}`);
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it('respects ROSETTE_PERSONALIZATION_ENABLED=false flag', async () => {
    process.env.ROSETTE_PERSONALIZATION_ENABLED = 'false';
    const req = new Request('http://test/api/personalization/picks?limit=2');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ buyAgain: [], recommended: [], reason: 'fallback' });
    // should not call auth or provider when disabled
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it('clamps limit via zod default and handles locale ar', async () => {
    mockCreateClient.mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'uid2' } } })) },
    } as any);
    const mockPicks = makePicks({ reason: 'history' });
    const getPicksSpy = vi.fn(async () => mockPicks);
    mockGetProvider.mockResolvedValue({ getPicks: getPicksSpy } as any);

    const req = new Request('http://test/api/personalization/picks?locale=ar&excludeSlug=rose-hour');
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(getPicksSpy).toHaveBeenCalledWith('uid2', expect.objectContaining({ locale: 'ar', excludeSlug: 'rose-hour', limit: 8 }));
  });

  it('returns fallback with private no-cache and logs on provider error', async () => {
    mockCreateClient.mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'uid' } } })) },
    } as any);
    mockGetProvider.mockResolvedValue({
      getPicks: vi.fn(async () => {
        throw new Error('db down');
      }),
    } as any);

    const req = new Request('http://test/api/personalization/picks?limit=2');
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(mockLogger.error).toHaveBeenCalledWith('personalization.picks.failed', expect.any(Object));
    const body = await res.json();
    expect(body).toEqual({ buyAgain: [], recommended: [], reason: 'fallback' });
    // Catch path must not cache the empty response (I-04)
    expect(res.headers.get('Cache-Control')).toBe('private, max-age=0');
  });

  // Brief's minimal snippet compatibility: ensure basic authed case works with rpc/from style mock if provider not mocked via above
  it('brief snippet: returns 200 for authed (compatibility)', async () => {
    mockCreateClient.mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'uid' } } })) },
      rpc: vi.fn(async () => ({ data: [{ slug: 'rose-hour', score: 1001, reason: 'buy_again' }], error: null })),
      from: vi.fn(() => ({
        select: () => ({
          in: () => ({
            eq: async () => ({
              data: [
                {
                  slug: 'rose-hour',
                  name_en: 'Rose Hour',
                  name_ar: 'ساعة الورد',
                  description_en: '',
                  description_ar: '',
                  category: 'hand-bouquet',
                  occasions: ['birthday'],
                  price_minor: 12000,
                  tone: '#bc6d63',
                  delivery: 'Same-day',
                  active: true,
                  created_at: '2026-01-02',
                },
              ],
              error: null,
            }),
          }),
        }),
      })),
    } as any);
    // provider will be re-resolved via createClient mock; but we mocked provider directly, so ensure provider still returns
    mockGetProvider.mockResolvedValue({
      getPicks: vi.fn(async () => makePicks()),
    } as any);
    const req = new Request('http://test/api/personalization/picks?limit=2');
    const res = await GET(req);
    expect(res.status).toBe(200);
  });
});
