import { NextResponse } from 'next/server';
import { getCurrentAdmin } from '@/features/auth/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { planPayloadSchema } from '@/features/admin/catalog-validation';

type PlanRow = {
  id: unknown;
  slug: unknown;
  name_en?: unknown;
  name_ar?: unknown;
  name_fr?: unknown;
  description_en?: unknown;
  description_ar?: unknown;
  description_fr?: unknown;
  frequencies?: unknown;
  bundle_prices?: unknown;
  product_id?: unknown;
  active?: unknown;
  sort_order?: unknown;
};

function mapPlan(row: PlanRow) {
  return {
    id: String(row.id),
    slug: String(row.slug),
    nameEn: String(row.name_en ?? ''),
    nameAr: String(row.name_ar ?? ''),
    nameFr: String(row.name_fr ?? ''),
    descriptionEn: String(row.description_en ?? ''),
    descriptionAr: String(row.description_ar ?? ''),
    descriptionFr: String(row.description_fr ?? ''),
    frequencies: Array.isArray(row.frequencies) ? row.frequencies : [],
    bundlePrices: Array.isArray(row.bundle_prices) ? row.bundle_prices : [],
    productId: row.product_id ? String(row.product_id) : null,
    active: row.active !== false,
    sortOrder: Number(row.sort_order ?? 0),
  };
}

export async function GET() {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data } = await getAdminSupabase().from('subscription_plans').select('*').order('sort_order', { ascending: true });
  return NextResponse.json({ items: ((data ?? []) as PlanRow[]).map(mapPlan) });
}

export async function POST(request: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Malformed request' }, { status: 400 });
  const parsed = planPayloadSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid plan data' }, { status: 400 });
  const { data, error } = await getAdminSupabase().from('subscription_plans').insert({
    slug: parsed.data.slug,
    name_en: parsed.data.nameEn, name_ar: parsed.data.nameAr, name_fr: parsed.data.nameFr,
    description_en: parsed.data.descriptionEn, description_ar: parsed.data.descriptionAr, description_fr: parsed.data.descriptionFr,
    product_id: parsed.data.productId ?? null, frequencies: parsed.data.frequencies, bundle_prices: parsed.data.bundlePrices,
    active: parsed.data.active, sort_order: parsed.data.sortOrder,
  }).select('id').single();
  if (error) return NextResponse.json({ error: 'Could not create plan' }, { status: 503 });
  return NextResponse.json({ ok: true, id: String(data.id) });
}
