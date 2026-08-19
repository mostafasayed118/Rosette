import { NextResponse } from 'next/server';
import { getCartByRestoreToken } from '@/features/cart/cart-sync';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { logRouteError } from '@/lib/api';

export async function GET(request: Request) {
  try {
    const token = new URL(request.url).searchParams.get('token') ?? '';
    const result = await getCartByRestoreToken(getAdminSupabase(), { token });
    if (result.status === 'not_found') return NextResponse.json({ error: 'Cart not found' }, { status: 404 });
    if (result.status === 'failure') return NextResponse.json({ error: 'Could not restore the cart' }, { status: 500 });
    return NextResponse.json({ lines: result.lines }, { status: 200 });
  } catch (error) {
    logRouteError('cart restore', error);
    return NextResponse.json({ error: 'Cart restore is temporarily unavailable.' }, { status: 503 });
  }
}
