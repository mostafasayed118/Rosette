import { notFound, redirect } from 'next/navigation';
import { getCurrentCustomer } from '@/features/auth/customer';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getServerT } from '@/features/i18n/server';
import { getSubscriptionDetail } from '@/features/subscriptions/control';
import { SubscriptionDetail } from '@/features/subscriptions/SubscriptionDetail';

type PageParams = { params: Promise<{ locale: string; city: string; id: string }> };

export default async function AccountSubscriptionDetailPage({ params }: PageParams) {
  const { locale, city, id } = await params;
  const customer = await getCurrentCustomer();
  if (!customer) redirect(`/${locale}/${city}/account/login`);

  const client = getAdminSupabase();
  const detail = await getSubscriptionDetail(client, id);
  if (!detail || detail.customerId !== customer.id) notFound();

  return <SubscriptionDetail data={detail} accountPath={`/${locale}/${city}/account`} />;
}
