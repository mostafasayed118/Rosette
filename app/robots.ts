import type { MetadataRoute } from 'next';
import { getOptionalServerEnv } from '@/lib/server-env';

export default function robots(): MetadataRoute.Robots {
  const base = (getOptionalServerEnv('SITE_URL') ?? 'https://rosette.fly.dev').replace(/\/$/, '');
  return {
    rules: { userAgent: '*', allow: '/' },
    sitemap: `${base}/sitemap.xml`,
  };
}
