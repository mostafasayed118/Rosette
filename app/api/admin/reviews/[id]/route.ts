import { NextResponse } from 'next/server';
import { reviewProductReview } from '@/features/reviews/reviews-service';
import { getCurrentAdmin } from '@/features/auth/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { respond } from '@/lib/api';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Admin authorization required' }, { status: 403 });
  const { id } = await context.params;
  const body = (await request.json()) as { action?: unknown };
  if (body.action !== 'approve' && body.action !== 'reject') return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  const result = await reviewProductReview(getAdminSupabase(), { admin, reviewId: id, action: body.action });
  return respond(result.status, {
    not_found: { status: 404, error: 'Review not found' },
    failure: { status: 500, error: 'Could not review the product review' },
  }, { ok: true, status: result.status });
}
