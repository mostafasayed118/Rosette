import { SiteFooter } from '@/components/layout/SiteFooter';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { getCityBySlug } from '@/features/destination/data';
import { GiftCardPurchaseForm } from '@/features/gift-cards/GiftCardPurchaseForm';

export default async function GiftCardsPage({ params }: { params: Promise<{ locale: string; city: string }> }) {
  const { locale, city } = await params;
  const cityCode = getCityBySlug(city)?.code ?? city;
  return (
    <div className="flex min-h-screen flex-col bg-surface text-on-surface selection:bg-primary/20 selection:text-primary">
      <SiteHeader />
      <main id="main-content" className="flex-grow w-full relative z-10 pt-8 pb-16 md:py-16">
        <GiftCardPurchaseForm cityCode={cityCode} />
      </main>
      <SiteFooter locale={locale} city={city} />
    </div>
  );
}
