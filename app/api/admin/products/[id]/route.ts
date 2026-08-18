import { NextResponse } from 'next/server';
import { saveProduct } from '@/features/admin/catalog-actions';
import type { SaveProductInput } from '@/features/admin/catalog-validation';
import { getCurrentAdmin } from '@/features/auth/server';
import { getAdminSupabase } from '@/lib/supabase/admin';

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Admin authorization required' }, { status: 403 });
  const { id } = await context.params;
  const body = (await request.json()) as { product?: unknown };
  if (!body.product || typeof body.product !== 'object') return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  const result = await saveProduct(getAdminSupabase(), admin, { mode: 'update', id, product: body.product as SaveProductInput });
  if (result === 'forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (result === 'validation') return NextResponse.json({ error: 'Invalid product data' }, { status: 400 });
  if (result === 'not_found') return NextResponse.json({ error: 'Product not found' }, { status: 404 });
  if (result === 'failure') return NextResponse.json({ error: 'Could not save product' }, { status: 500 });
  return NextResponse.json({ ok: true });
}