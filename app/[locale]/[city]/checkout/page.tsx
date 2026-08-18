import { SiteFooter } from '@/components/layout/SiteFooter';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { CheckoutForm } from '@/features/checkout/CheckoutForm';
import { LocalizedPageHeading } from '@/features/i18n/LocalizedPageHeading';
import { getCityBySlug } from '@/features/destination/data';

export default async function CheckoutPage({ params }: { params: Promise<{ locale: string; city: string }> }) {
  const { city } = await params;
  const cityCode = getCityBySlug(city)?.code ?? city;
  return <div className="flex min-h-screen flex-col"><SiteHeader /><main className="mx-auto w-[min(calc(100%-3rem),80rem)] py-12 pb-24 max-md:w-[min(calc(100%-2rem),80rem)] max-md:pt-4"><LocalizedPageHeading eyebrow="checkoutEyebrow" title="checkoutTitle" lede="checkoutLede" /><CheckoutForm cityCode={cityCode} /></main><SiteFooter /></div>;
}
