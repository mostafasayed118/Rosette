import { getOptionalServerEnv } from '@/lib/server-env';

/**
 * The public origin for callback/redirect URLs.
 *
 * `new URL(request.url).origin` reflects the internal host when the app runs
 * behind a tunnel or reverse proxy (e.g. cloudflared -> localhost), so payment
 * callbacks would point at an unreachable address. SITE_URL overrides it.
 */
export function getPublicOrigin(request: Request) {
  const configured = getOptionalServerEnv('SITE_URL');
  if (configured) return configured.replace(/\/$/, '');
  return new URL(request.url).origin;
}
