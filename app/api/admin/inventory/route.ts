import { NextResponse } from 'next/server';
import { setInventory } from '@/features/admin/catalog-actions';
import { getCurrentAdmin } from '@/features/auth/server';
import { getAdminSupabase } from '@/lib/supabase/admin';

export async function POST(request: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Admin authorization required' }, { status: 403 });
  const body = (await request.json()) as { variantId?: unknown; quantity?: unknown };
  if (typeof body.variantId !== 'string' || typeof body.quantity !== 'number') return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  const result = await setInventory(getAdminSupabase(), admin, { variantId: body.variantId, quantity: body.quantity });
  if (result === 'forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (result === 'validation') return NextResponse.json({ error: 'Invalid quantity' }, { status: 400 });
  if (result === 'failure') return NextResponse.json({ error: 'Could not update inventory' }, { status: 500 });
  return NextResponse.json({ ok: true });
}