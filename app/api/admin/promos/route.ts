import { NextResponse } from 'next/server';
import { savePromoCode, createPromoCode, type PromoInput } from '@/features/admin/promo-actions';
import { getCurrentAdmin } from '@/features/auth/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { respond } from '@/lib/api';

export async function POST(request: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Admin authorization required' }, { status: 403 });
  const body = (await request.json()) as Record<string, unknown>;
  const input = body.promo as unknown;
  if (!input || typeof input !== 'object') return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  const promo = input as PromoInput;
  if (body.action === 'update-promo') {
    const result = await savePromoCode(getAdminSupabase(), admin, promo);
    return respond(result, {
      forbidden: { status: 403, error: 'Forbidden' },
      validation: { status: 400, error: 'Invalid promo data' },
      failure: { status: 500, error: 'Could not save promo' },
    });
  }
  if (body.action === 'create-promo') {
    const result = await createPromoCode(getAdminSupabase(), admin, promo);
    return respond(result, {
      forbidden: { status: 403, error: 'Forbidden' },
      validation: { status: 400, error: 'Invalid promo data' },
      code_taken: { status: 409, error: 'Code already exists' },
      failure: { status: 500, error: 'Could not create promo' },
    }, { ok: true }, 201);
  }
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
