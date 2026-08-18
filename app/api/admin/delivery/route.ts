import { NextResponse } from 'next/server';
import { saveDeliveryRule, createCityWithRule } from '@/features/admin/delivery-actions';
import { getCurrentAdmin } from '@/features/auth/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { respond } from '@/lib/api';

export async function POST(request: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Admin authorization required' }, { status: 403 });
  const body = (await request.json()) as Record<string, unknown>;

  if (body.action === 'update-rule') {
    const { cityCode, feeMinor, minimumOrderMinor, cutoffHour, active } = body;
    if (typeof cityCode !== 'string' || typeof feeMinor !== 'number' || typeof minimumOrderMinor !== 'number' || typeof cutoffHour !== 'number' || typeof active !== 'boolean') {
      return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
    }
    const result = await saveDeliveryRule(getAdminSupabase(), admin, { cityCode, feeMinor, minimumOrderMinor, cutoffHour, active });
    return respond(result, {
      forbidden: { status: 403, error: 'Forbidden' },
      validation: { status: 400, error: 'Invalid rule data' },
      failure: { status: 500, error: 'Could not save rule' },
    });
  }

  if (body.action === 'create-city') {
    const { code, nameEn, nameAr, sameDay, feeMinor, minimumOrderMinor, cutoffHour } = body;
    if (typeof code !== 'string' || typeof nameEn !== 'string' || typeof nameAr !== 'string' || typeof sameDay !== 'boolean' || typeof feeMinor !== 'number' || typeof minimumOrderMinor !== 'number' || typeof cutoffHour !== 'number') {
      return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
    }
    const result = await createCityWithRule(getAdminSupabase(), admin, { code, nameEn, nameAr, sameDay, feeMinor, minimumOrderMinor, cutoffHour });
    return respond(result, {
      forbidden: { status: 403, error: 'Forbidden' },
      validation: { status: 400, error: 'Invalid city data' },
      city_taken: { status: 409, error: 'City code already exists' },
      failure: { status: 500, error: 'Could not create city' },
    }, { ok: true }, 201);
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
