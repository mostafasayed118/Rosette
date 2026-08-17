import { SiteFooter } from '@/components/layout/SiteFooter';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { OrderPageContent } from '@/features/order/OrderPageContent';

export default async function OrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ token?: string }> }) {
  const { id } = await params;
  const { token } = await searchParams;
  return <div className="page-shell"><SiteHeader /><main className="content-frame"><OrderPageContent id={id} token={token} /></main><SiteFooter /></div>;
}
