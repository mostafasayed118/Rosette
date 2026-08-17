import { SiteFooter } from '@/components/layout/SiteFooter';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { CartPageContent } from '@/features/cart/CartPageContent';
import { LocalizedPageHeading } from '@/features/i18n/LocalizedPageHeading';

export default function CartPage() {
  return <div className="page-shell"><SiteHeader /><main className="content-frame"><LocalizedPageHeading eyebrow="bagEyebrow" title="bagTitle" lede="bagLede" /><CartPageContent /></main><SiteFooter /></div>;
}
