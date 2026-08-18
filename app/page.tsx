'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { ProductVisual } from '@/components/ui/ProductVisual';
import { DestinationGate } from '@/features/destination/DestinationGate';
import { getCity } from '@/features/destination/data';
import { clearDestination, readDestination } from '@/features/destination/storage';
import type { Destination } from '@/features/destination/types';
import { useI18n } from '@/features/i18n/I18nProvider';
import { pickLocalized } from '@/features/i18n/pick';

const HERO_IMAGE_URL = 'https://images.unsplash.com/photo-1519378058457-4c29a0a2efac?w=1400&q=80&auto=format&fit=crop';
const MINI_IMAGES = [
  'https://vwjqtwxqangblapnmtbm.supabase.co/storage/v1/object/public/product-images/rose-hour.jpg',
  'https://vwjqtwxqangblapnmtbm.supabase.co/storage/v1/object/public/product-images/little-thanks.jpg',
  'https://vwjqtwxqangblapnmtbm.supabase.co/storage/v1/object/public/product-images/quiet-orchid.jpg',
];

export default function HomePage() {
  const { locale, t } = useI18n();
  const [destination, setDestination] = useState<Destination | null>(null);
  useEffect(() => setDestination(readDestination()), []);
  const city = destination ? getCity(destination.cityCode) : null;
  const cityName = city ? pickLocalized(locale, { en: city.name, ar: city.nameAr, fr: city.nameFr }) : undefined;

  return <div className="page-shell"><SiteHeader cityName={cityName} onDestinationChange={() => { clearDestination(); setDestination(null); }} /><main><section className="hero-section"><div className="hero-copy"><p className="eyebrow">{t('homeEyebrow')}</p><h1>{t('homeTitle')}</h1><p className="lede">{t('homeLede')}</p>{destination ? <Link className="button" href="/shop">{t('explore')} <span aria-hidden="true">↗</span></Link> : <DestinationGate onSelected={setDestination} />}</div><div className="hero-visual"><ProductVisual tone="#d19a82" imageUrl={HERO_IMAGE_URL} label="A warm bouquet of fresh flowers" /><div className="hero-caption"><span>01 / 04</span><span>Quietly memorable</span></div></div></section><section className="editorial-strip"><div><p className="eyebrow">{t('editorialEyebrow')}</p><h2>{t('editorialTitle')}</h2></div><div className="mini-visuals">{MINI_IMAGES.map((url) => <ProductVisual key={url} compact tone="#6f8b73" imageUrl={url} label="A botanical arrangement from the collection" />)}</div></section></main><SiteFooter /></div>;
}
