import { NextResponse } from 'next/server';
import { submitProductReview } from '@/features/reviews/reviews-service';
import { getCurrentCustomer } from '@/features/auth/customer';
import { getAdminSupabase } from '@/lib/supabase/admin';

export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  const customer = await getCurrentCustomer();
  if (!customer) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  const { slug } = await context.params;
  const body = (await request.json()) as { rating?: unknown; body?: unknown };
  const result = await submitProductReview(getAdminSupabase(), { customerId: customer.id, productSlug: slug, rating: body.rating, body: body.body });
  if (result.status === 'invalid') return NextResponse.json({ error: 'Invalid rating or review body' }, { status: 400 });
  if (result.status === 'not_found') return NextResponse.json({ error: 'Product not found' }, { status: 404 });
  if (result.status === 'not_verified') return NextResponse.json({ error: 'Verified purchase required' }, { status: 403 });
  if (result.status === 'already_reviewed') return NextResponse.json({ error: 'already_reviewed' }, { status: 409 });
  if (result.status === 'failure') return NextResponse.json({ error: 'Could not submit review' }, { status: 500 });
  return NextResponse.json({ ok: true, status: 'pending' }, { status: 201 });
}
