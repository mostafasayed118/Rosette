import { NextResponse } from 'next/server';
import { removeWishlistItem } from '@/features/wishlist/wishlist-actions';
import { getCurrentCustomer } from '@/features/auth/customer';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';

export async function DELETE(_request: Request, context: { params: Promise<{ slug: string }> }) {
  try {
    const customer = await getCurrentCustomer();
    if (!customer) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    const { slug } = await context.params;
    const result = await removeWishlistItem(getAdminSupabase(), { customerId: customer.id, slug });
    if (result.status === 'not_found') return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    if (result.status === 'failure') return NextResponse.json({ error: 'Could not remove the item' }, { status: 500 });
    return NextResponse.json({ removed: true }, { status: 200 });
  } catch (error) {
    logger.error('route.error', { scope: 'wishlist item remove', error });
    return NextResponse.json({ error: 'Could not remove the item' }, { status: 500 });
  }
}
