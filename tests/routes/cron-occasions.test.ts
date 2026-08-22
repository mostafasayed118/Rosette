import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/admin', () => ({
  getAdminSupabase: () => ({ from: () => ({ select: () => Promise.resolve({ data: [], error: null }) }) }),
}));
vi.mock('@/lib/server-env', () => ({
  getRequiredServerEnv: (key: string) => (key === 'CRON_SECRET' ? 'test-secret' : 'other'),
  getOptionalServerEnv: () => undefined,
}));
vi.mock('@/features/occasions/occasions-cron', () => ({
  runOccasionCron: vi.fn().mockResolvedValue({ checked: 3, sent: 1, failed: 0, suppressed: 2 }),
}));

const { GET, POST } = await import('@/app/api/cron/occasions/route');

function request(auth?: string): Request {
  return new Request('https://rosette.test/api/cron/occasions', {
    method: 'POST',
    ...(auth ? { headers: { authorization: auth } } : {}),
  });
}

beforeEach(() => vi.clearAllMocks());

describe('POST /api/cron/occasions', () => {
  it('rejects a request with no bearer token', async () => {
    expect((await POST(request())).status).toBe(401);
  });

  it('rejects a wrong bearer token', async () => {
    expect((await POST(request('Bearer nope'))).status).toBe(401);
  });

  it('runs the cron and returns the summary', async () => {
    const res = await POST(request('Bearer test-secret'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, summary: { checked: 3, sent: 1, failed: 0, suppressed: 2 } });
  });

  it('exposes GET for schedulers that cannot POST', async () => {
    expect((await GET(request('Bearer test-secret'))).status).toBe(200);
  });
});
