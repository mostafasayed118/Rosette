import { SiteFooter } from '@/components/layout/SiteFooter';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { CartPageContent } from '@/features/cart/CartPageContent';
import { LocalizedPageHeading } from '@/features/i18n/LocalizedPageHeading';
import { getCityBySlug } from '@/features/destination/data';

export default async function CartPage({ params }: { params: Promise<{ locale: string; city: string }> }) {
  const { locale, city } = await params;
  const cityCode = getCityBySlug(city)?.code ?? city;
  return <div className="flex min-h-screen flex-col"><SiteHeader /><main className="mx-auto w-[min(calc(100%-3rem),80rem)] py-12 pb-24 max-md:w-[min(calc(100%-2rem),80rem)] max-md:pt-4"><LocalizedPageHeading eyebrow="bagEyebrow" title="bagTitle" lede="bagLede" /><CartPageContent cityCode={cityCode} /></main><SiteFooter locale={locale} city={city} /></div>;
}
