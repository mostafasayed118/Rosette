import { NextResponse } from 'next/server';
import { getCatalogRepository } from '@/features/catalog/provider';
import type { Product } from '@/features/catalog/types';
import { logger } from '@/lib/logger';

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const slugs = (params.get('slugs') ?? '').split(',').map((slug) => slug.trim()).filter(Boolean);
    if (slugs.length === 0 || slugs.length > 50) return NextResponse.json({ error: 'Invalid slugs' }, { status: 400 });
    const { products } = await getCatalogRepository().list({});
    const bySlug = new Map(products.map((product) => [product.slug, product]));
    const result = slugs.flatMap((slug) => { const product = bySlug.get(slug); return product ? [product] : []; });
    return NextResponse.json({ products: result as Product[] });
  } catch (error) {
    logger.error('route.error', { scope: 'wishlist products lookup', error });
    return NextResponse.json({ error: 'Could not load products' }, { status: 503 });
  }
}
