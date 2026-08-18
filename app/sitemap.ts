import type { MetadataRoute } from 'next';
import { LOCALES } from '@/lib/locale-routing';
import { cities } from '@/features/destination/data';
import { getCatalogRepository } from '@/features/catalog/provider';
import { getOptionalServerEnv } from '@/lib/server-env';
import { buildSitemapEntries } from '@/features/seo/sitemap';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = (getOptionalServerEnv('SITE_URL') ?? 'https://rosette.fly.dev').replace(/\/$/, '');
  const { products } = await getCatalogRepository().list({});
  return buildSitemapEntries({
    base,
    locales: LOCALES,
    cities: cities.map((city) => city.slug),
    products: products.map((product) => ({ slug: product.slug })),
  });
}
