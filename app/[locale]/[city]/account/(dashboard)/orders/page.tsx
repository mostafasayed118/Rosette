import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { StatusMessage } from '@/components/ui/status-message';
import { listCustomerOrders } from '@/features/account/account-repository';
import { getCurrentCustomer } from '@/features/auth/customer';
import { getServerSupabase } from '@/lib/supabase/server';
import { getServerT } from '@/features/i18n/server';
import { formatMoney } from '@/features/money';
import { fulfillmentLabel, fulfillmentBadgeVariant } from '@/features/admin/status-labels';

export default async function AccountOrdersPage({ params }: { params: Promise<{ locale: string; city: string }> }) {
  const { locale: routeLocale, city } = await params;
  const customer = await getCurrentCustomer();
  if (!customer) redirect(`/${routeLocale}/${city}/account/login`);
  const { t, locale } = await getServerT();
  const supabase = await getServerSupabase();
  const orders = supabase ? await listCustomerOrders(supabase, customer.id) : [];
  if (!orders.length) return <StatusMessage title={t('noOrdersYet')} />;
  return (
    <ul className="grid gap-3">
      {orders.map((order) => (
        <li key={order.id} className="flex items-center justify-between gap-4 rounded-2xl border bg-card p-4 shadow-sm max-md:flex-col max-md:items-start">
          <div>
            <Link className="font-bold text-primary underline-offset-4 hover:underline" href={`/${routeLocale}/${city}/account/orders/${order.id}`}>{order.displayNumber}</Link>
            <p className="text-sm text-muted-foreground">{new Date(order.createdAt).toLocaleDateString(locale === 'ar' ? 'ar-EG' : locale === 'fr' ? 'fr-FR' : 'en-GB')}</p>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant={fulfillmentBadgeVariant(order.fulfillmentStatus)}>{fulfillmentLabel(order.fulfillmentStatus, t)}</Badge>
            <strong>{formatMoney(order.totalMinor, locale)}</strong>
          </div>
        </li>
      ))}
    </ul>
  );
}
