import { NextResponse } from 'next/server';
import { getCurrentAdmin } from '@/features/auth/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { listAdminSubscriptions } from '@/features/subscriptions/admin-actions';

export async function GET(request: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const status = new URL(request.url).searchParams.get('status') ?? undefined;
  const items = await listAdminSubscriptions(getAdminSupabase(), admin, { status });
  return NextResponse.json({ items });
}
