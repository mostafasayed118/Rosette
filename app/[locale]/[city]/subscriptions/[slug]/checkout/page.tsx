import { notFound, redirect } from 'next/navigation';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { getCurrentCustomer } from '@/features/auth/customer';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getServerT } from '@/features/i18n/server';
import { getPlanBySlug } from '@/features/subscriptions/repository';
import { SubscriptionCheckoutForm } from '@/features/subscriptions/SubscriptionCheckoutForm';
import { getOptionalServerEnv } from '@/lib/server-env';
import { getCityBySlug } from '@/features/destination/data';

type PageParams = { params: Promise<{ locale: string; city: string; slug: string }> };

export default async function SubscriptionCheckoutPage({ params }: PageParams) {
  const { locale, city, slug } = await params;
  const customer = await getCurrentCustomer();
  if (!customer) redirect(`/${locale}/${city}/account/login`);

  const { t } = await getServerT(locale);
  const plan = await getPlanBySlug(getAdminSupabase(), slug);
  if (!plan || !plan.active) notFound();
  const cityCode = getCityBySlug(city)?.code ?? city;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      <main className="flex-grow w-full max-w-[720px] mx-auto px-5 md:px-16 py-10 md:py-16">
        <header className="grid gap-3 border-b border-outline-variant/25 pb-8">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-sage">{t('subscriptionsTitle')}</p>
          <h1 className="font-display text-[clamp(2rem,4vw,3rem)] font-semibold leading-[1.05] tracking-[-0.02em] text-primary">
            {t('subscriptionCheckoutTitle')}
          </h1>
        </header>
        <div className="pt-10">
          <SubscriptionCheckoutForm plan={plan} cityCode={cityCode} citySlug={city} turnstileSiteKey={getOptionalServerEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY')} />
        </div>
      </main>
      <SiteFooter locale={locale} city={city} />
    </div>
  );
}
