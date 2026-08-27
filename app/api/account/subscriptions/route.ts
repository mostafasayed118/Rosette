import { NextResponse } from 'next/server';
import { getCurrentCustomer } from '@/features/auth/customer';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { listCustomerSubscriptions } from '@/features/subscriptions/control';

export async function GET() {
  const customer = await getCurrentCustomer();
  if (!customer) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  const items = await listCustomerSubscriptions(getAdminSupabase(), customer.id);
  return NextResponse.json({ items });
}
