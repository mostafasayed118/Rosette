import { SiteFooter } from '@/components/layout/SiteFooter';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { GiftCardCheckoutResult } from '@/features/gift-cards/GiftCardCheckoutResult';
import { getCityBySlug } from '@/features/destination/data';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { GiftCardResultShell } from './result-shell';

export default async function GiftCardResultPage({ params, searchParams }: { params: Promise<{ locale: string; city: string }>; searchParams: Promise<{ reference?: string }> }) {
  const { locale, city } = await params;
  const { reference } = await searchParams;
  let status: 'pending' | 'paid' | 'failed' = 'pending';
  if (reference) {
    try {
      const { data } = await getAdminSupabase().from('gift_card_purchases').select('status').eq('reference', reference).maybeSingle();
      if (data?.status === 'paid' || data?.status === 'failed') status = data.status;
    } catch { status = 'pending'; }
  }
  const cityCode = getCityBySlug(city)?.code ?? city;
  return <div className="flex min-h-screen flex-col"><SiteHeader /><main className="mx-auto w-[min(calc(100%-3rem),80rem)] flex-1 py-12 pb-24 max-md:w-[min(calc(100%-2rem),80rem)] max-md:pt-4"><GiftCardResultShell locale={locale} city={city} cityCode={cityCode}><GiftCardCheckoutResult status={status} /></GiftCardResultShell></main><SiteFooter locale={locale} city={city} /></div>;
}
