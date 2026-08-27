import { NextResponse } from 'next/server';
import { getCurrentAdmin } from '@/features/auth/server';
import { getAdminSupabase } from '@/lib/supabase/admin';

const FREQUENCIES = ['weekly', 'biweekly', 'monthly'];

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await context.params;
  const { data } = await getAdminSupabase().from('subscription_plans').select('*').eq('id', id).maybeSingle();
  if (!data) return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
  return NextResponse.json({ plan: data });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Malformed request' }, { status: 400 });
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.nameEn !== undefined) patch.name_en = String(body.nameEn);
  if (body.nameAr !== undefined) patch.name_ar = String(body.nameAr);
  if (body.nameFr !== undefined) patch.name_fr = String(body.nameFr);
  if (body.descriptionEn !== undefined) patch.description_en = String(body.descriptionEn);
  if (body.descriptionAr !== undefined) patch.description_ar = String(body.descriptionAr);
  if (body.descriptionFr !== undefined) patch.description_fr = String(body.descriptionFr);
  if (Array.isArray(body.frequencies)) {
    const frequencies = body.frequencies.filter((f: unknown) => FREQUENCIES.includes(f as string));
    if (frequencies.length === 0) return NextResponse.json({ error: 'At least one frequency required' }, { status: 400 });
    patch.frequencies = frequencies;
  }
  if (Array.isArray(body.bundlePrices)) patch.bundle_prices = body.bundlePrices;
  if (body.productId !== undefined) patch.product_id = body.productId || null;
  if (body.active !== undefined) patch.active = body.active !== false;
  if (body.sortOrder !== undefined) patch.sort_order = Number(body.sortOrder);
  const { error } = await getAdminSupabase().from('subscription_plans').update(patch).eq('id', id);
  if (error) return NextResponse.json({ error: 'Could not update plan' }, { status: 503 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await context.params;
  const { error } = await getAdminSupabase().from('subscription_plans').delete().eq('id', id);
  if (error) return NextResponse.json({ error: 'Could not delete plan' }, { status: 503 });
  return NextResponse.json({ ok: true });
}
