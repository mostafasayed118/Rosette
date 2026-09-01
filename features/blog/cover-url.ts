/**
 * Cover images are rendered with `next/image` (see
 * `components/admin/ImagePreview.tsx`), which throws at runtime for hostnames
 * missing from `next.config.ts` `images.remotePatterns`. Validating at write
 * time keeps one bad URL from breaking the whole admin blog list render.
 * The allowed list must stay in sync with that config.
 */

export const COVER_IMAGE_HOSTS = [
  'images.unsplash.com',
  'lh3.googleusercontent.com',
] as const;

/** Supabase storage lives on project subdomains: `**.supabase.co`. */
function isSupabaseHost(hostname: string): boolean {
  return hostname === 'supabase.co' || hostname.endsWith('.supabase.co');
}

/**
 * Returns null when the URL is safe to hand to `next/image`, otherwise a
 * machine-readable reason ('empty' is valid: covers are optional).
 */
export function validateCoverImageUrl(input: string | null | undefined): 'empty' | 'invalid' | 'scheme' | 'host' | null {
  const value = input?.trim() ?? '';
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return 'invalid';
  }
  if (url.protocol !== 'https:') return 'scheme';
  if (!COVER_IMAGE_HOSTS.includes(url.hostname as (typeof COVER_IMAGE_HOSTS)[number]) && !isSupabaseHost(url.hostname)) return 'host';
  return null;
}
