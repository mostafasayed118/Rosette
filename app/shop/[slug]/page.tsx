import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { ProductDetail } from '@/features/product/ProductDetail';
import { getCatalogRepository } from '@/features/catalog/provider';

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await getCatalogRepository().getBySlug(slug);
  if (!product) return <main className="mx-auto grid min-h-[70vh] w-[min(calc(100%-3rem),80rem)] place-content-center justify-items-start"><p className="text-xs font-bold uppercase tracking-[.16em] text-sage">Not in this season</p><h1 className="mt-2 mb-6 max-w-[12ch] font-display text-[clamp(2.5rem,6vw,4.5rem)] leading-[.95]">That arrangement has gone home.</h1><Button asChild><Link href="/shop">Return to the collection ↗</Link></Button></main>;
  return <div className="flex min-h-screen flex-col"><SiteHeader /><main className="mx-auto w-[min(calc(100%-3rem),80rem)] py-12 pb-24 max-md:w-[min(calc(100%-2rem),80rem)] max-md:pt-4"><Link className="text-sm text-primary underline underline-offset-4" href="/shop">← Back to the collection</Link><ProductDetail product={product} /></main><SiteFooter /></div>;
}
