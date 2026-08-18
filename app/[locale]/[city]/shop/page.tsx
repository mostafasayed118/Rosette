import { SiteFooter } from '@/components/layout/SiteFooter';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { CatalogGrid } from '@/features/catalog/CatalogGrid';
import { LocalizedPageHeading } from '@/features/i18n/LocalizedPageHeading';
import { CatalogToolbar } from '@/features/catalog/CatalogToolbar';
import { parseCatalogQuery } from '@/features/catalog/catalog-utils';
import { getCatalogRepository } from '@/features/catalog/provider';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ShopPage({ params, searchParams }: { params: Promise<{ locale: string; city: string }>; searchParams: SearchParams }) {
  const { locale } = await params;
  const raw = await searchParams;
  const queryParams = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) if (typeof value === 'string') queryParams.set(key, value);
  const query = parseCatalogQuery(queryParams);
  const result = await getCatalogRepository().list(query);
  return <div className="flex min-h-screen flex-col"><SiteHeader /><main className="mx-auto w-[min(calc(100%-3rem),80rem)] py-12 pb-24 max-md:w-[min(calc(100%-2rem),80rem)] max-md:pt-4"><LocalizedPageHeading eyebrow="collectionEyebrow" title="collectionTitle" lede="collectionLede" action="changeDestination" actionHref={`/${locale}`} /><CatalogToolbar /><CatalogGrid products={result.products} /></main><SiteFooter /></div>;
}
