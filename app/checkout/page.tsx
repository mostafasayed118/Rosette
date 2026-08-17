import { SiteFooter } from '@/components/layout/SiteFooter';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { CheckoutForm } from '@/features/checkout/CheckoutForm';
import { LocalizedPageHeading } from '@/features/i18n/LocalizedPageHeading';

export default function CheckoutPage() { return <div className="page-shell"><SiteHeader /><main className="content-frame"><LocalizedPageHeading eyebrow="checkoutEyebrow" title="checkoutTitle" lede="checkoutLede" /><CheckoutForm /></main><SiteFooter /></div>; }
