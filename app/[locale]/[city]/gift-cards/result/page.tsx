import { SiteFooter } from '@/components/layout/SiteFooter';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { GiftCardCheckoutResult } from '@/features/gift-cards/GiftCardCheckoutResult';
import { getCityBySlug } from '@/features/destination/data';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { GiftCardResultShell } from './result-shell';

export default async function GiftCardResultPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; city: string }>;
  searchParams: Promise<{ reference?: string }>;
}) {
  const { locale, city } = await params;
  const { reference } = await searchParams;
  let status: 'pending' | 'paid' | 'failed' = 'pending';
  if (reference) {
    try {
      const { data } = await getAdminSupabase().from('gift_card_purchases').select('status').eq('reference', reference).maybeSingle();
      if (data?.status === 'paid' || data?.status === 'failed') status = data.status;
    } catch {
      status = 'pending';
    }
  }
  const cityCode = getCityBySlug(city)?.code ?? city;
  return (
    <div className="flex min-h-screen flex-col bg-surface text-on-surface selection:bg-primary/20 selection:text-primary">
      <SiteHeader />
      <main className="flex-grow w-full relative z-10 pt-8 pb-16 md:py-16">
        <div className="max-w-[1280px] mx-auto px-5 md:px-[64px]">
          <GiftCardResultShell locale={locale} city={city} cityCode={cityCode}>
            <GiftCardCheckoutResult status={status} />
          </GiftCardResultShell>
        </div>
      </main>
      <SiteFooter locale={locale} city={city} />
    </div>
  );
}
