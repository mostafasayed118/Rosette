import { redirect } from 'next/navigation';
import { getCurrentCustomer } from '@/features/auth/customer';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getServerT } from '@/features/i18n/server';
import { listCustomerSubscriptions } from '@/features/subscriptions/control';
import { SubscriptionsPanel } from '@/features/subscriptions/SubscriptionsPanel';

type PageParams = { params: Promise<{ locale: string; city: string }> };

export default async function AccountSubscriptionsPage({ params }: PageParams) {
  const { locale, city } = await params;
  const customer = await getCurrentCustomer();
  if (!customer) redirect(`/${locale}/${city}/account/login`);

  const { t } = await getServerT(locale);
  const client = getAdminSupabase();
  const items = await listCustomerSubscriptions(client, customer.id);

  return (
    <section className="grid gap-8">
      <header className="grid gap-3 border-b border-outline-variant/25 pb-8">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-sage">{t('subscriptionsLede')}</p>
        <h1 className="font-display text-[clamp(2rem,4vw,3rem)] font-semibold leading-[1.05] tracking-[-0.02em] text-primary">
          {t('subscriptionsTitle')}
        </h1>
      </header>
      <SubscriptionsPanel items={items} accountPath={`/${locale}/${city}/account`} />
    </section>
  );
}
