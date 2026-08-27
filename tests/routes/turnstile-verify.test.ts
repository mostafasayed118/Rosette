import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/turnstile/verify/route';
import { resetRateLimits } from '@/lib/rate-limit';

function mockSiteVerify(success: boolean) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ success, 'error-codes': success ? undefined : ['invalid-input-response'] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

function verifyRequest(ip = '1.1.1.1', body: unknown = { token: 'token-1' }) {
  return new Request('https://rosette.test/api/turnstile/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  resetRateLimits();
  vi.stubEnv('TURNSTILE_SECRET_KEY', 'secret-1');
});

afterEach(() => {
  resetRateLimits();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('POST /api/turnstile/verify', () => {
  it('rejects a missing token with 400', async () => {
    const res = await POST(verifyRequest('1.1.1.1', {}));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ success: false, error: 'Missing token' });
  });

  it('returns the Cloudflare verdict for a valid token', async () => {
    const fetchMock = mockSiteVerify(true);
    const res = await POST(verifyRequest('1.1.1.2'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, errorCodes: undefined });
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]?.body))).toMatchObject({ secret: 'secret-1', response: 'token-1', remoteip: '1.1.1.2' });
  });

  it('passes through a rejection verdict', async () => {
    mockSiteVerify(false);
    const res = await POST(verifyRequest('1.1.1.3'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: false, errorCodes: ['invalid-input-response'] });
  });

  it('answers 500 when the secret is not configured', async () => {
    vi.stubEnv('TURNSTILE_SECRET_KEY', '');
    mockSiteVerify(true);
    const res = await POST(verifyRequest('1.1.1.4'));
    expect(res.status).toBe(500);
  });

  it('answers 500 on a malformed body', async () => {
    const res = await POST(verifyRequest('1.1.1.5', '{not-json'));
    expect(res.status).toBe(500);
  });

  it('rate limits repeated verification attempts from one ip', async () => {
    mockSiteVerify(true);
    let last: Response | undefined;
    for (let attempt = 0; attempt < 21; attempt += 1) last = await POST(verifyRequest('9.9.9.9'));
    expect(last!.status).toBe(429);
    expect(last!.headers.get('Retry-After')).toBeTruthy();
  });
});
