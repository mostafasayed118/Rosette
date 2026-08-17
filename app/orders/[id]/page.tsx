import { SiteFooter } from '@/components/layout/SiteFooter';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { OrderPageContent } from '@/features/order/OrderPageContent';

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <div className="page-shell"><SiteHeader /><main className="content-frame"><OrderPageContent id={id} /></main><SiteFooter /></div>; }
