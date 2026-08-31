import { NextResponse } from 'next/server';
import { saveProduct } from '@/features/admin/catalog-actions';
import { productPayloadSchema } from '@/features/admin/catalog-validation';
import { getCurrentAdmin } from '@/features/auth/server';
import { getAdminSupabase } from '@/lib/supabase/admin';

export async function POST(request: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Admin authorization required' }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  const parsed = productPayloadSchema.safeParse((body as { product?: unknown }).product);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid product data' }, { status: 400 });
  const result = await saveProduct(getAdminSupabase(), admin, { mode: 'create', product: parsed.data });
  if (result === 'forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (result === 'validation') return NextResponse.json({ error: 'Invalid product data' }, { status: 400 });
  if (result === 'slug_taken') return NextResponse.json({ error: 'Slug already in use' }, { status: 409 });
  if (result === 'failure') return NextResponse.json({ error: 'Could not save product' }, { status: 500 });
  return NextResponse.json({ ok: true }, { status: 201 });
}