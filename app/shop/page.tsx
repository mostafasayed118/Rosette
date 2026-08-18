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
  return <div className="flex min-h-screen flex-col"><SiteHeader /><main className="mx-auto w-[min(calc(100%-3rem),80rem)] py-12 pb-24 max-md:w-[min(calc(100%-2rem),80rem)] max-md:pt-4"><LocalizedPageHeading eyebrow="collectionEyebrow" title="collectionTitle" lede="collectionLede" action="changeDestination" actionHref="/" /><CatalogToolbar /><CatalogGrid products={result.products} /></main><SiteFooter /></div>;
}
