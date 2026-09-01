/**
 * Cloudflare Web Analytics - FREE privacy-first analytics.
 * No cookies, no JS bundle impact, GDPR compliant.
 * Just add beacon token from dash.cloudflare.com > Web Analytics.
 * Docs: https://developers.cloudflare.com/analytics/web-analytics/
 */

export function CloudflareWebAnalytics({ token, enabled = true }: { token?: string; enabled?: boolean }) {
  if (!token || !enabled) return null;
  return (
    <script
      defer
      src="https://static.cloudflareinsights.com/beacon.min.js"
      data-cf-beacon={`{"token": "${token}"}`}
    />
  );
}

/**
 * USAGE:
 * 1. Go to dash.cloudflare.com > Web Analytics > Add site -> copy token
 * 2. Set env: NEXT_PUBLIC_CF_BEACON_TOKEN=your-token
 * 3. In app/layout.tsx:
 *    import { CloudflareWebAnalytics } from '@/components/analytics/CloudflareWebAnalytics';
 *    ...
 *    <body>
 *      {children}
 *      <CloudflareWebAnalytics token={process.env.NEXT_PUBLIC_CF_BEACON_TOKEN} />
 *    </body>
 */
