import { NextResponse } from 'next/server';
import { mergeWishlist } from '@/features/wishlist/wishlist-actions';
import { getCurrentCustomer } from '@/features/auth/customer';
import { getAdminSupabase } from '@/lib/supabase/admin';

export async function POST(request: Request) {
  const customer = await getCurrentCustomer();
  if (!customer) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  const body = (await request.json()) as { slugs?: unknown; locale?: unknown };
  if (!Array.isArray(body.slugs) || body.slugs.some((slug) => typeof slug !== 'string')) return NextResponse.json({ error: 'Invalid slugs' }, { status: 400 });
  const locale = body.locale === 'ar' || body.locale === 'fr' ? body.locale : 'en';
  const result = await mergeWishlist(getAdminSupabase(), { customerId: customer.id, slugs: body.slugs as string[], locale });
  if (result.status === 'failure') return NextResponse.json({ error: 'Could not merge the wishlist' }, { status: 500 });
  return NextResponse.json({ slugs: result.slugs }, { status: 200 });
}
