import { SiteFooter } from '@/components/layout/SiteFooter';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { CartPageContent } from '@/features/cart/CartPageContent';
import { CheckoutStepper } from '@/features/checkout/CheckoutStepper';
import { getCityBySlug } from '@/features/destination/data';

export default async function CartPage({ params }: { params: Promise<{ locale: string; city: string }> }) {
  const { locale, city } = await params;
  const cityCode = getCityBySlug(city)?.code ?? city;
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      <main id="main-content" className="flex-grow w-full max-w-[1280px] mx-auto px-5 md:px-16 py-10 md:py-12">
        <CheckoutStepper locale={locale} />
        <CartPageContent cityCode={cityCode} />
      </main>
      <SiteFooter locale={locale} city={city} />
    </div>
  );
}
