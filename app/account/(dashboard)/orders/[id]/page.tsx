import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getCustomerOrder } from '@/features/account/account-repository';
import { getCurrentCustomer } from '@/features/auth/customer';
import { getServerSupabase } from '@/lib/supabase/server';
import { getServerT } from '@/features/i18n/server';
import { formatMoney } from '@/features/money';
import { fulfillmentLabel, paymentLabel, fulfillmentBadgeVariant, paymentBadgeVariant } from '@/features/admin/status-labels';

export default async function AccountOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const customer = await getCurrentCustomer();
  if (!customer) redirect('/account/login');
  const { t, locale } = await getServerT();
  const { id } = await params;
  const supabase = await getServerSupabase();
  const order = supabase ? await getCustomerOrder(supabase, customer.id, id) : null;
  if (!order) notFound();

  return (
    <div className="grid gap-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-[.16em] text-sage"><Link className="underline underline-offset-4" href="/account/orders">{t('myOrders')}</Link> · {order.displayNumber}</p>
        <div className="mt-2 flex items-center gap-3">
          <h1 className="font-display text-[clamp(2rem,4vw,3rem)] leading-tight tracking-[-.02em]">{order.displayNumber}</h1>
          <Badge variant={fulfillmentBadgeVariant(order.fulfillmentStatus)}>{fulfillmentLabel(order.fulfillmentStatus, t)}</Badge>
          <Badge variant={paymentBadgeVariant(order.paymentStatus)}>{paymentLabel(order.paymentStatus, t)}</Badge>
        </div>
        <p className="text-muted-foreground">{formatMoney(order.totalMinor, locale)} · {new Date(order.createdAt).toLocaleDateString(locale === 'ar' ? 'ar-EG' : locale === 'fr' ? 'fr-FR' : 'en-GB')}</p>
      </div>

      <Card><CardHeader><CardTitle>{t('deliveryDetails')}</CardTitle></CardHeader><CardContent>
        <p>{order.recipientName}</p>
        <p className="text-muted-foreground">{order.deliveryAddress}</p>
        <p className="text-muted-foreground">{order.deliveryDate} · {order.deliveryWindow}</p>
      </CardContent></Card>

      <Card><CardHeader><CardTitle>{t('items')}</CardTitle></CardHeader><CardContent className="grid gap-2">
        {order.items.map((item) => (
          <p key={item.id} className="flex justify-between gap-4 border-b py-2 text-sm">{item.nameEn} × {item.quantity}<strong>{formatMoney((item.unitPriceMinor + item.addOns.reduce((sum, addOn) => sum + addOn.price, 0)) * item.quantity, locale)}</strong></p>
        ))}
        <p className="flex justify-between gap-4 pt-2 text-sm">{t('subtotal')}<strong>{formatMoney(order.subtotalMinor, locale)}</strong></p>
        <p className="flex justify-between gap-4 text-sm">{t('delivery')}<strong>{formatMoney(order.deliveryFeeMinor, locale)}</strong></p>
        <p className="flex justify-between gap-4 font-bold">{t('total')}<strong>{formatMoney(order.totalMinor, locale)}</strong></p>
      </CardContent></Card>

      {order.events.length ? (
        <Card><CardHeader><CardTitle>{t('timeline')}</CardTitle></CardHeader><CardContent>
          <ol className="grid list-none gap-0 p-0">
            {order.events.map((event) => (
              <li key={event.id} className="flex min-h-10 items-center gap-3 text-sm text-muted-foreground"><span className="h-2.5 w-2.5 shrink-0 rounded-full border-2 border-border bg-background" aria-hidden="true" />{event.eventType} · {new Date(event.createdAt).toLocaleString(locale === 'ar' ? 'ar-EG' : locale === 'fr' ? 'fr-FR' : 'en-GB')}</li>
            ))}
          </ol>
        </CardContent></Card>
      ) : null}

      <p className="text-xs text-muted-foreground"><Link className="text-primary underline underline-offset-4" href="/account/orders">{t('backToAccount')}</Link></p>
    </div>
  );
}
