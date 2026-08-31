import { NextResponse } from 'next/server';
import { customerVoterKey, getVoteState, toggleVote, visitorVoterKey } from '@/features/reviews/vote-service';
import { getCurrentCustomer } from '@/features/auth/customer';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { RATE_LIMITS, enforceRateLimit } from '@/lib/rate-limit-guard';
import { getOptionalServerEnv } from '@/lib/server-env';

type VoteContext = { params: Promise<{ id: string }> };

const VISITOR_COOKIE = 'rv_vid';

function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get('cookie');
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) {
      return decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return undefined;
}

function setVisitorCookie(response: NextResponse, value: string): void {
  response.cookies.set(VISITOR_COOKIE, value, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
  });
}

/**
 * Server-controlled voter identity for anonymous visitors.
 *
 * The raw cookie value is a random UUID the server issues (HttpOnly, Secure,
 * SameSite), so the client can never choose it. The voter key is an HMAC of
 * that value, which means a client also cannot forge an arbitrary key to
 * bypass the unique (review_id, voter_key) constraint (ballot stuffing, R-14).
 */
async function deriveVisitorVoterKey(rawValue: string): Promise<string> {
  const secret = getOptionalServerEnv('CRON_SECRET') ?? 'rosette-visitor-voter-dev';
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawValue));
  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return visitorVoterKey(hex);
}

async function resolveVoterKey(
  request: Request,
): Promise<{ voterKey: string; newCookieValue?: string }> {
  const customer = await getCurrentCustomer();
  if (customer) return { voterKey: customerVoterKey(customer.id) };

  let raw = readCookie(request, VISITOR_COOKIE);
  let newCookieValue: string | undefined;
  if (!raw) {
    raw = crypto.randomUUID();
    newCookieValue = raw;
  }
  const voterKey = await deriveVisitorVoterKey(raw);
  return { voterKey, newCookieValue };
}

export async function GET(request: Request, context: VoteContext) {
  const limited = await enforceRateLimit(request, RATE_LIMITS.reviewVoteGet);
  if (limited) return limited;
  const { id } = await context.params;
  const { voterKey, newCookieValue } = await resolveVoterKey(request);
  try {
    const result = await getVoteState(getAdminSupabase(), { reviewId: id, voterKey });
    if (result.status === 'not_found') return NextResponse.json({ error: 'Review not found' }, { status: 404 });
    const response = NextResponse.json({ helpful: result.helpful, voted: result.voted });
    if (newCookieValue) setVisitorCookie(response, newCookieValue);
    return response;
  } catch {
    return NextResponse.json({ error: 'Could not load votes' }, { status: 500 });
  }
}

export async function POST(request: Request, context: VoteContext) {
  const limited = await enforceRateLimit(request, RATE_LIMITS.reviewVote);
  if (limited) return limited;
  const { id } = await context.params;
  const { voterKey, newCookieValue } = await resolveVoterKey(request);
  try {
    const result = await toggleVote(getAdminSupabase(), { reviewId: id, voterKey });
    if (result.status === 'not_found') return NextResponse.json({ error: 'Review not found' }, { status: 404 });
    const response = NextResponse.json({ helpful: result.helpful, voted: result.voted });
    if (newCookieValue) setVisitorCookie(response, newCookieValue);
    return response;
  } catch {
    return NextResponse.json({ error: 'Could not update vote' }, { status: 500 });
  }
}
