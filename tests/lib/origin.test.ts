import { afterEach, describe, expect, it, vi } from 'vitest';
import { getPublicOrigin } from '@/lib/origin';

function request(url: string, headers: Record<string, string> = {}): Request {
  return new Request(url, { headers });
}

afterEach(() => vi.unstubAllEnvs());

describe('getPublicOrigin', () => {
  it('prefers the configured SITE_URL (minus trailing slash)', () => {
    vi.stubEnv('SITE_URL', 'https://rosette.example/');
    expect(getPublicOrigin(request('http://internal:3000/api/orders'))).toBe('https://rosette.example');
  });

  it('uses forwarded host/proto when SITE_URL is unset', () => {
    vi.stubEnv('SITE_URL', '');
    const result = getPublicOrigin(request('http://127.0.0.1:8787/api/orders', { 'x-forwarded-host': 'rosette.example', 'x-forwarded-proto': 'https' }));
    expect(result).toBe('https://rosette.example');
  });

  it('rejects forwarded hosts carrying path or scheme characters', () => {
    vi.stubEnv('SITE_URL', '');
    const result = getPublicOrigin(request('https://rosette.example/api/orders', { 'x-forwarded-host': 'evil.example/steal', 'x-forwarded-proto': 'https' }));
    expect(result).toBe('https://rosette.example');
  });

  it('rejects forwarded plaintext origins that are not localhost', () => {
    vi.stubEnv('SITE_URL', '');
    const result = getPublicOrigin(request('https://rosette.example/api/orders', { 'x-forwarded-host': 'rosette.example', 'x-forwarded-proto': 'http' }));
    expect(result).toBe('https://rosette.example');
  });

  it('falls back to the https request origin (Cloudflare/OpenNext)', () => {
    vi.stubEnv('SITE_URL', '');
    expect(getPublicOrigin(request('https://rosette.example/api/orders'))).toBe('https://rosette.example');
  });

  it('resolves localhost http for local development', () => {
    vi.stubEnv('SITE_URL', '');
    expect(getPublicOrigin(request('http://localhost:3000/api/orders'))).toBe('http://localhost:3000');
  });
});
