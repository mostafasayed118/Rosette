import { SiteFooter } from '@/components/layout/SiteFooter';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { WishlistPageContent } from '@/components/wishlist/WishlistPageContent';
import { getServerT } from '@/features/i18n/server';

type WishlistPageParams = { params: Promise<{ locale: string; city: string }> };

export default async function WishlistPage({ params }: WishlistPageParams) {
  const { locale: localeSegment, city } = await params;
  const { locale } = await getServerT(localeSegment);
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      <main className="mx-auto w-full max-w-[80rem] flex-1 px-5 py-8 pb-24 md:px-16 md:py-16">
        <WishlistPageContent />
      </main>
      <SiteFooter locale={locale} city={city} />
    </div>
  );
}
