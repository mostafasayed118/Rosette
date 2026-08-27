import { getOptionalServerEnv } from '@/lib/server-env';
import { logger } from '@/lib/logger';

/**
 * The public origin for callback/redirect URLs.
 *
 * Resolution order:
 *  1. `SITE_URL` — authoritative override (tunnels, proxies, previews).
 *  2. `X-Forwarded-Host`/`X-Forwarded-Proto` — accepted only when they resolve
 *     to an https (or localhost) origin, so a spoofable header can never
 *     inject a foreign host into payment callbacks or emailed links.
 *  3. `request.url` origin — on Cloudflare/OpenNext this already reflects the
 *     public hostname. An insecure result here means a dev tunnel/reverse
 *     proxy is in play and `SITE_URL` should be set (runbook §2.3).
 */
function stripTrailingSlash(origin: string): string {
  return origin.replace(/\/+$/, '');
}

function isSafeOrigin(url: URL): boolean {
  if (url.protocol === 'https:') return true;
  const host = url.hostname;
  return url.protocol === 'http:' && (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host.endsWith('.localhost'));
}

function forwardedOrigin(request: Request): string | null {
  const host = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
  if (!host || !/^[\w.-]+$/.test(host)) return null;
  const proto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() ?? 'https';
  try {
    const url = new URL(`${proto}://${host}`);
    return isSafeOrigin(url) ? stripTrailingSlash(url.toString()) : null;
  } catch {
    return null;
  }
}

export function getPublicOrigin(request: Request): string {
  const configured = getOptionalServerEnv('SITE_URL');
  if (configured) return stripTrailingSlash(configured);
  const forwarded = forwardedOrigin(request);
  if (forwarded) return forwarded;
  const origin = stripTrailingSlash(new URL(request.url).origin);
  if (!isSafeOrigin(new URL(origin))) {
    logger.warn('origin.insecure_fallback', { origin });
  }
  return origin;
}

