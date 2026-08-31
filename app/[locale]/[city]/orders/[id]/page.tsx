import { SiteFooter } from '@/components/layout/SiteFooter';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { OrderPageContent } from '@/features/order/OrderPageContent';

export default async function OrderPage({ params, searchParams }: { params: Promise<{ id: string; locale: string; city: string }>; searchParams: Promise<{ token?: string }> }) {
  const { id, locale, city } = await params;
  const { token } = await searchParams;
  return <div className="flex min-h-screen flex-col"><SiteHeader /><main id="main-content" className="mx-auto w-[min(calc(100%-3rem),80rem)] py-12 pb-24 max-md:w-[min(calc(100%-2rem),80rem)] max-md:pt-4"><OrderPageContent id={id} token={token} /></main><SiteFooter locale={locale} city={city} /></div>;
}
