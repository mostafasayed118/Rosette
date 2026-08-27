import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkTurnstileToken, verifyTurnstileToken } from '@/lib/turnstile';

function mockSiteVerify(response: { success: boolean; 'error-codes'?: string[] }) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify(response), { status: 200, headers: { 'Content-Type': 'application/json' } }),
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('verifyTurnstileToken', () => {
  it('posts the token, secret and client ip to siteverify', async () => {
    const fetchMock = mockSiteVerify({ success: true });
    const result = await verifyTurnstileToken('token-1', 'secret-1', '1.2.3.4');
    expect(result).toEqual({ success: true, errorCodes: undefined });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify');
    expect(JSON.parse(String(init?.body))).toEqual({ secret: 'secret-1', response: 'token-1', remoteip: '1.2.3.4' });
  });

  it('surfaces Cloudflare error codes', async () => {
    mockSiteVerify({ success: false, 'error-codes': ['timeout-or-duplicate'] });
    expect(await verifyTurnstileToken('token-1', 'secret-1')).toEqual({ success: false, errorCodes: ['timeout-or-duplicate'] });
  });
});

describe('checkTurnstileToken', () => {
  it('passes through when no secret is configured (feature off)', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    expect(await checkTurnstileToken(undefined, undefined)).toBe('pass');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports a missing token when enforcement is on', async () => {
    expect(await checkTurnstileToken(undefined, 'secret-1')).toBe('missing');
    expect(await checkTurnstileToken('', 'secret-1')).toBe('missing');
    expect(await checkTurnstileToken(42, 'secret-1')).toBe('missing');
  });

  it('verifies a present token against Cloudflare', async () => {
    mockSiteVerify({ success: true });
    expect(await checkTurnstileToken('token-1', 'secret-1')).toBe('pass');
  });

  it('reports invalid when Cloudflare rejects the token', async () => {
    mockSiteVerify({ success: false, 'error-codes': ['invalid-input-response'] });
    expect(await checkTurnstileToken('token-1', 'secret-1')).toBe('invalid');
  });
});
