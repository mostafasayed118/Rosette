import { NextResponse } from 'next/server';
import { saveDeliveryRule, createCityWithRule } from '@/features/admin/delivery-actions';
import { getCurrentAdmin } from '@/features/auth/server';
import { getAdminSupabase } from '@/lib/supabase/admin';

export async function POST(request: Request) {
  const identity = await getCurrentAdmin();
  if (!identity) return NextResponse.json({ error: 'Admin authorization required' }, { status: 403 });
  const body = (await request.json()) as Record<string, unknown>;

  if (body.action === 'update-rule') {
    const { cityCode, feeMinor, minimumOrderMinor, cutoffHour, active } = body;
    if (typeof cityCode !== 'string' || typeof feeMinor !== 'number' || typeof minimumOrderMinor !== 'number' || typeof cutoffHour !== 'number' || typeof active !== 'boolean') {
      return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
    }
    const result = await saveDeliveryRule(getAdminSupabase(), identity, { cityCode, feeMinor, minimumOrderMinor, cutoffHour, active });
    if (result === 'forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    if (result === 'validation') return NextResponse.json({ error: 'Invalid rule data' }, { status: 400 });
    if (result === 'failure') return NextResponse.json({ error: 'Could not save rule' }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === 'create-city') {
    const { code, nameEn, nameAr, sameDay, feeMinor, minimumOrderMinor, cutoffHour } = body;
    if (typeof code !== 'string' || typeof nameEn !== 'string' || typeof nameAr !== 'string' || typeof sameDay !== 'boolean' || typeof feeMinor !== 'number' || typeof minimumOrderMinor !== 'number' || typeof cutoffHour !== 'number') {
      return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
    }
    const result = await createCityWithRule(getAdminSupabase(), identity, { code, nameEn, nameAr, sameDay, feeMinor, minimumOrderMinor, cutoffHour });
    if (result === 'forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    if (result === 'validation') return NextResponse.json({ error: 'Invalid city data' }, { status: 400 });
    if (result === 'city_taken') return NextResponse.json({ error: 'City code already exists' }, { status: 409 });
    if (result === 'failure') return NextResponse.json({ error: 'Could not create city' }, { status: 500 });
    return NextResponse.json({ ok: true }, { status: 201 });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
