import { NextResponse } from 'next/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getRequiredServerEnv } from '@/lib/server-env';
import { getPublicOrigin } from '@/lib/origin';
import { createPaymobIntention } from '@/features/payment/paymob-client';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { orderId?: string };
    if (!body.orderId) return NextResponse.json({ error: 'orderId is required' }, { status: 400 });
    const supabase = getAdminSupabase();
    const { data: order, error } = await supabase.from('orders').select('id,display_number,total_minor,customer_email,customer_phone,recipient_name').eq('id', body.orderId).maybeSingle();
    if (error || !order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    if (order.total_minor <= 0) return NextResponse.json({ error: 'Invalid order total' }, { status: 400 });

    const origin = getPublicOrigin(request);
    const result = await createPaymobIntention({
      amountMinor: order.total_minor,
      orderReference: order.display_number,
      integrationId: Number(getRequiredServerEnv('PAYMOB_INTEGRATION_ID')),
      customer: { name: order.recipient_name, email: order.customer_email, phone: order.customer_phone },
      notificationUrl: `${origin}/api/webhooks/paymob`,
      redirectionUrl: `${origin}/orders/${order.id}`,
    });
    await supabase.from('orders').update({ payment_status: 'payment_started' }).eq('id', order.id).eq('payment_status', 'pending');
    return NextResponse.json(result);
  } catch (error) {
    console.error('Paymob intention error', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json({ error: 'Payment setup is temporarily unavailable.' }, { status: 503 });
  }
}
