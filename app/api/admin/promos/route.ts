import { NextResponse } from 'next/server';
import { savePromoCode, createPromoCode, type PromoInput } from '@/features/admin/promo-actions';
import { getCurrentAdmin } from '@/features/auth/server';
import { getAdminSupabase } from '@/lib/supabase/admin';

export async function POST(request: Request) {
  const identity = await getCurrentAdmin();
  if (!identity) return NextResponse.json({ error: 'Admin authorization required' }, { status: 403 });
  const body = (await request.json()) as Record<string, unknown>;
  const input = body.promo as unknown;
  if (!input || typeof input !== 'object') return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  const promo = input as PromoInput;
  if (body.action === 'update-promo') {
    const result = await savePromoCode(getAdminSupabase(), identity, promo);
    if (result === 'forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    if (result === 'validation') return NextResponse.json({ error: 'Invalid promo data' }, { status: 400 });
    if (result === 'failure') return NextResponse.json({ error: 'Could not save promo' }, { status: 500 });
    return NextResponse.json({ ok: true });
  }
  if (body.action === 'create-promo') {
    const result = await createPromoCode(getAdminSupabase(), identity, promo);
    if (result === 'forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    if (result === 'validation') return NextResponse.json({ error: 'Invalid promo data' }, { status: 400 });
    if (result === 'code_taken') return NextResponse.json({ error: 'Code already exists' }, { status: 409 });
    if (result === 'failure') return NextResponse.json({ error: 'Could not create promo' }, { status: 500 });
    return NextResponse.json({ ok: true }, { status: 201 });
  }
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
