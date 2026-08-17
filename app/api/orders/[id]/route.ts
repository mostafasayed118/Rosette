import { NextResponse } from 'next/server';
import { getAdminSupabase } from '@/lib/supabase/admin';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const token = new URL(request.url).searchParams.get('token');
  if (!token) return NextResponse.json({ error: 'Order verification is required' }, { status: 401 });
  const { data: order, error } = await getAdminSupabase().from('orders').select('id,display_number,recipient_name,delivery_address,delivery_date,delivery_window,subtotal_minor,delivery_fee_minor,total_minor,payment_status,fulfillment_status,order_items(id,product_name_en,product_name_ar,unit_price_minor,quantity,add_ons)').eq('id', id).eq('public_token', token).maybeSingle();
  if (error || !order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  return NextResponse.json({
    id: order.id,
    displayNumber: order.display_number,
    recipient: { name: order.recipient_name, phone: '' },
    delivery: { address: order.delivery_address, date: order.delivery_date, window: order.delivery_window },
    totals: { subtotal: order.subtotal_minor, deliveryFee: order.delivery_fee_minor, total: order.total_minor },
    payment: { method: 'paymob', status: order.payment_status === 'paid' ? 'authorized' : order.payment_status === 'payment_failed' ? 'failed' : 'pending' },
    status: order.fulfillment_status,
    items: (order.order_items ?? []).map((item) => ({ id: item.id, productName: item.product_name_en, productNameAr: item.product_name_ar, unitPrice: item.unit_price_minor, quantity: item.quantity, addOns: Array.isArray(item.add_ons) ? item.add_ons.map((addOn) => ({ id: String(addOn.id ?? ''), name: String(addOn.name ?? addOn.name_en ?? ''), price: Number(addOn.price ?? addOn.price_minor ?? 0) })) : [], tone: '#b85c45', message: '', productSlug: item.product_name_en, deliveryDate: order.delivery_date })),
  });
}
