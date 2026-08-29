import { NextResponse } from 'next/server';
import { saveWishlistItem } from '@/features/wishlist/wishlist-actions';
import { getCurrentCustomer } from '@/features/auth/customer';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';

export async function POST(request: Request) {
  try {
    const customer = await getCurrentCustomer();
    if (!customer) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    const body = (await request.json()) as { slug?: unknown; locale?: unknown };
    if (typeof body.slug !== 'string' || body.slug.trim() === '') return NextResponse.json({ error: 'Invalid slug' }, { status: 400 });
    const locale = body.locale === 'ar' || body.locale === 'fr' ? body.locale : 'en';
    const result = await saveWishlistItem(getAdminSupabase(), { customerId: customer.id, slug: body.slug.trim(), locale });
    if (result.status === 'not_found') return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    if (result.status === 'failure') return NextResponse.json({ error: 'Could not save the item' }, { status: 500 });
    return NextResponse.json({ saved: true }, { status: 200 });
  } catch (error) {
    logger.error('route.error', { scope: 'wishlist item add', error });
    return NextResponse.json({ error: 'Could not save the item' }, { status: 500 });
  }
}
