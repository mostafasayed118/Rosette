import Link from 'next/link';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { CatalogGrid } from '@/features/catalog/CatalogGrid';
import { LocalizedPageHeading } from '@/features/i18n/LocalizedPageHeading';
import { CatalogToolbar } from '@/features/catalog/CatalogToolbar';
import { parseCatalogQuery } from '@/features/catalog/catalog-utils';
import { getCatalogRepository } from '@/features/catalog/provider';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ShopPage({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) if (typeof value === 'string') params.set(key, value);
  const query = parseCatalogQuery(params);
  const result = await getCatalogRepository().list(query);
  return <div className="page-shell"><SiteHeader /><main className="content-frame"><LocalizedPageHeading eyebrow="collectionEyebrow" title="collectionTitle" lede="collectionLede" action="changeDestination" actionHref="/" /><CatalogToolbar /><CatalogGrid products={result.products} /></main><SiteFooter /></div>;
}
