import { SiteFooter } from '@/components/layout/SiteFooter';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { WishlistPageContent } from '@/components/wishlist/WishlistPageContent';
import { getServerT } from '@/features/i18n/server';

type WishlistPageParams = { params: Promise<{ locale: string; city: string }> };

export default async function WishlistPage({ params }: WishlistPageParams) {
  const { locale: localeSegment, city } = await params;
  const { locale, t } = await getServerT(localeSegment);
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto w-[min(calc(100%-3rem),80rem)] py-12 pb-24 max-md:w-[min(calc(100%-2rem),80rem)] max-md:pt-4">
        <p className="text-xs font-bold uppercase tracking-[.16em] text-sage">{t('wishlist')}</p>
        <h1 className="font-display text-[clamp(2rem,4vw,3rem)] leading-tight tracking-[-.02em]">{t('wishlist')}</h1>
        <WishlistPageContent />
      </main>
      <SiteFooter locale={locale} city={city} />
    </div>
  );
}
