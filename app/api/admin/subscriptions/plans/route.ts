import { NextResponse } from 'next/server';
import { getCurrentAdmin } from '@/features/auth/server';
import { getAdminSupabase } from '@/lib/supabase/admin';

const FREQUENCIES = ['weekly', 'biweekly', 'monthly'];
const SLUG_RE = /^[a-z0-9-]+$/;

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
  const slug = String(body.slug ?? '').trim();
  if (!SLUG_RE.test(slug)) return NextResponse.json({ error: 'Invalid slug' }, { status: 400 });
  const frequencies = Array.isArray(body.frequencies) ? body.frequencies.filter((f: unknown) => FREQUENCIES.includes(f as string)) : [];
  if (frequencies.length === 0) return NextResponse.json({ error: 'At least one frequency required' }, { status: 400 });
  const bundlePrices = Array.isArray(body.bundlePrices) ? body.bundlePrices : null;
  if (!bundlePrices || bundlePrices.length === 0) return NextResponse.json({ error: 'At least one bundle price required' }, { status: 400 });
  const { data, error } = await getAdminSupabase().from('subscription_plans').insert({
    slug,
    name_en: String(body.nameEn ?? ''), name_ar: String(body.nameAr ?? ''), name_fr: String(body.nameFr ?? ''),
    description_en: String(body.descriptionEn ?? ''), description_ar: String(body.descriptionAr ?? ''), description_fr: String(body.descriptionFr ?? ''),
    product_id: body.productId || null, frequencies, bundle_prices: bundlePrices,
    active: body.active !== false, sort_order: Number(body.sortOrder ?? 0),
  }).select('id').single();
  if (error) return NextResponse.json({ error: 'Could not create plan' }, { status: 503 });
  return NextResponse.json({ ok: true, id: String(data.id) });
}
