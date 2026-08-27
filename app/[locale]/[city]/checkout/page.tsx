import { SiteFooter } from '@/components/layout/SiteFooter';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { CheckoutForm } from '@/features/checkout/CheckoutForm';
import { getCheckoutPaymentMethods } from '@/features/checkout/payment-mode';
import { getCityBySlug } from '@/features/destination/data';
import { getOptionalServerEnv } from '@/lib/server-env';

function CheckoutProgress() {
  return (
    <div className="mb-10 flex items-center justify-center gap-4 md:gap-8 max-w-2xl mx-auto">
      <div className="flex flex-col items-center">
        <div className="w-8 h-8 rounded-full bg-primary text-on-primary grid place-items-center font-mono text-[13px] tracking-[0.05em]">1</div>
        <span className="mt-2 text-sm font-medium text-primary">Bag</span>
      </div>
      <div className="h-px w-12 md:w-24 bg-outline-variant/50 self-start mt-4 shrink-0" aria-hidden />
      <div className="flex flex-col items-center">
        <div className="w-8 h-8 rounded-full border border-primary text-primary grid place-items-center font-mono text-[13px] tracking-[0.05em] bg-surface-container-low">2</div>
        <span className="mt-2 text-sm font-medium text-on-surface">Delivery</span>
      </div>
      <div className="h-px w-12 md:w-24 bg-outline-variant/50 self-start mt-4 shrink-0" aria-hidden />
      <div className="flex flex-col items-center opacity-60">
        <div className="w-8 h-8 rounded-full border border-outline-variant text-outline-variant grid place-items-center font-mono text-[13px] tracking-[0.05em]">3</div>
        <span className="mt-2 text-sm text-on-surface-variant">Payment</span>
      </div>
    </div>
  );
}

export default async function CheckoutPage({ params }: { params: Promise<{ locale: string; city: string }> }) {
  const { locale, city } = await params;
  const cityCode = getCityBySlug(city)?.code ?? city;
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      <main className="flex-grow w-full max-w-[1280px] mx-auto px-5 md:px-16 py-10 md:py-12">
        <CheckoutProgress />
        <CheckoutForm cityCode={cityCode} availablePaymentMethods={getCheckoutPaymentMethods()} turnstileSiteKey={getOptionalServerEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY')} />
      </main>
      <SiteFooter locale={locale} city={city} />
    </div>
  );
}
