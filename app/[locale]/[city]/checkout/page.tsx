import { SiteFooter } from '@/components/layout/SiteFooter';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { CheckoutForm } from '@/features/checkout/CheckoutForm';
import { CheckoutStepper } from '@/features/checkout/CheckoutStepper';
import { getCheckoutPaymentMethods } from '@/features/checkout/payment-mode';
import { getCityBySlug } from '@/features/destination/data';
import { getCurrentCustomer } from '@/features/auth/customer';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { listAddresses } from '@/features/account/addresses/repository';
import { getOptionalServerEnv } from '@/lib/server-env';

export default async function CheckoutPage({ params }: { params: Promise<{ locale: string; city: string }> }) {
  const { locale, city } = await params;
  const cityCode = getCityBySlug(city)?.code ?? city;
  let savedAddresses: Awaited<ReturnType<typeof listAddresses>> = [];
  try {
    const customer = await getCurrentCustomer();
    if (customer) savedAddresses = await listAddresses(getAdminSupabase(), customer.id);
  } catch {
    savedAddresses = [];
  }
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      <main id="main-content" className="flex-grow w-full max-w-[1280px] mx-auto px-5 md:px-16 py-10 md:py-12">
        <CheckoutStepper locale={locale} />
        <CheckoutForm
          cityCode={cityCode}
          availablePaymentMethods={getCheckoutPaymentMethods()}
          turnstileSiteKey={getOptionalServerEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY')}
          savedAddresses={savedAddresses.filter((entry) => entry.citySlug === city)}
        />
      </main>
      <SiteFooter locale={locale} city={city} />
    </div>
  );
}
