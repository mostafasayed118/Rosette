import { NextResponse } from 'next/server';
import { customerVoterKey, getVoteState, toggleVote, visitorVoterKey } from '@/features/reviews/vote-service';
import { getCurrentCustomer } from '@/features/auth/customer';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { RATE_LIMITS, enforceRateLimit } from '@/lib/rate-limit-guard';

type VoteContext = { params: Promise<{ id: string }> };

async function resolveVoterKey(request: Request): Promise<string | null> {
  const customer = await getCurrentCustomer();
  if (customer) return customerVoterKey(customer.id);
  const url = new URL(request.url);
  const visitor = url.searchParams.get('visitor');
  return visitor ? visitorVoterKey(visitor) : null;
}

export async function GET(request: Request, context: VoteContext) {
  const { id } = await context.params;
  const voterKey = await resolveVoterKey(request);
  if (!voterKey) return NextResponse.json({ error: 'A visitor id is required' }, { status: 400 });
  try {
    const result = await getVoteState(getAdminSupabase(), { reviewId: id, voterKey });
    if (result.status === 'not_found') return NextResponse.json({ error: 'Review not found' }, { status: 404 });
    return NextResponse.json({ helpful: result.helpful, voted: result.voted });
  } catch {
    return NextResponse.json({ error: 'Could not load votes' }, { status: 500 });
  }
}

export async function POST(request: Request, context: VoteContext) {
  const limited = await enforceRateLimit(request, RATE_LIMITS.reviewVote);
  if (limited) return limited;
  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as { visitor?: unknown };
  const customer = await getCurrentCustomer();
  const voterKey = customer ? customerVoterKey(customer.id) : (typeof body.visitor === 'string' && body.visitor ? visitorVoterKey(body.visitor) : null);
  if (!voterKey) return NextResponse.json({ error: 'A visitor id is required' }, { status: 400 });
  try {
    const result = await toggleVote(getAdminSupabase(), { reviewId: id, voterKey });
    if (result.status === 'not_found') return NextResponse.json({ error: 'Review not found' }, { status: 404 });
    return NextResponse.json({ helpful: result.helpful, voted: result.voted });
  } catch {
    return NextResponse.json({ error: 'Could not update vote' }, { status: 500 });
  }
}
