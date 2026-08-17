import Link from 'next/link';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { ProductDetail } from '@/features/product/ProductDetail';
import { localCatalogRepository } from '@/features/catalog/repository';

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await localCatalogRepository.getBySlug(slug);
  if (!product) return <main className="center-state"><p className="eyebrow">Not in this season</p><h1>That arrangement has gone home.</h1><Link className="button" href="/shop">Return to the collection ↗</Link></main>;
  return <div className="page-shell"><SiteHeader /><main className="content-frame"><Link className="back-link" href="/shop">← Back to the collection</Link><ProductDetail product={product} /></main><SiteFooter /></div>;
}
