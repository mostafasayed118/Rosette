import Link from 'next/link';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { Button } from '@/components/ui/button';
import { ProductVisual } from '@/components/ui/ProductVisual';
import { getCity } from '@/features/destination/data';
import { getServerT } from '@/features/i18n/server';
import { pickLocalized } from '@/features/i18n/pick';

const HERO_IMAGE_URL = 'https://images.unsplash.com/photo-1519378058457-4c29a0a2efac?w=1400&q=80&auto=format&fit=crop';
const MINI_IMAGES = [
  'https://vwjqtwxqangblapnmtbm.supabase.co/storage/v1/object/public/product-images/rose-hour.jpg',
  'https://vwjqtwxqangblapnmtbm.supabase.co/storage/v1/object/public/product-images/little-thanks.jpg',
  'https://vwjqtwxqangblapnmtbm.supabase.co/storage/v1/object/public/product-images/quiet-orchid.jpg',
];

export default async function HomePage({ params }: { params: Promise<{ locale: string; city: string }> }) {
  const { city: cityCode } = await params;
  const { locale, t } = await getServerT();
  const city = getCity(cityCode);
  const cityName = city ? pickLocalized(locale, { en: city.name, ar: city.nameAr, fr: city.nameFr }) : undefined;

  return <div className="flex min-h-screen flex-col"><SiteHeader cityName={cityName} /><main><section className="mx-auto grid w-[min(calc(100%-3rem),80rem)] md:min-h-[620px] max-md:min-h-[400px] grid-cols-[minmax(0,1fr)_minmax(320px,0.85fr)] items-center gap-20 py-8 pb-20 max-md:grid-cols-1 max-md:gap-8 max-md:pt-4"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-sage">{t('homeEyebrow')}</p><h1 className="mt-2 mb-6 max-w-[10ch] font-display text-[clamp(2.5rem,6vw,4.5rem)] leading-[.95] tracking-[-.06em] text-primary">{t('homeTitle')}</h1><p className="max-w-[34rem] text-[1.1rem] text-muted-foreground">{t('homeLede')}</p><Button asChild className="mt-6"><Link href={`/${locale}/${cityCode}/shop`}>{t('explore')} <span aria-hidden="true">↗</span></Link></Button></div><div className="relative overflow-hidden rounded-2xl shadow-lg"><ProductVisual tone="#d19a82" imageUrl={HERO_IMAGE_URL} label="A warm bouquet of fresh flowers" className="min-h-[520px] max-md:min-h-[360px] w-full" /></div></section><section className="mx-auto grid w-[min(calc(100%-3rem),80rem)] grid-cols-2 gap-12 border-t py-16 pb-24 max-md:grid-cols-1"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-sage">{t('editorialEyebrow')}</p><h2 className="mt-2 font-display text-5xl leading-none tracking-[-.04em] text-primary">{t('editorialTitle')}</h2></div><div className="grid grid-cols-3 gap-4">{MINI_IMAGES.map((url) => <ProductVisual key={url} compact tone="#6f8b73" imageUrl={url} label="A botanical arrangement from the collection" className="w-full" />)}</div></section></main><SiteFooter /></div>;
}
