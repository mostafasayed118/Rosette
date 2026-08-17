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

export default function HomePage() {
  const { locale, t } = useI18n();
  const [destination, setDestination] = useState<Destination | null>(null);
  useEffect(() => setDestination(readDestination()), []);
  const city = destination ? getCity(destination.cityCode) : null;
  const cityName = city ? (locale === 'ar' ? city.nameAr : city.name) : undefined;

  return <div className="page-shell"><SiteHeader cityName={cityName} onDestinationChange={() => { clearDestination(); setDestination(null); }} /><main><section className="hero-section"><div className="hero-copy"><p className="eyebrow">{t('homeEyebrow')}</p><h1>{t('homeTitle')}</h1><p className="lede">{t('homeLede')}</p>{destination ? <Link className="button" href="/shop">{t('explore')} <span aria-hidden="true">↗</span></Link> : <DestinationGate onSelected={setDestination} />}</div><div className="hero-visual"><ProductVisual tone="#d19a82" label="A warm terracotta botanical illustration" /><div className="hero-caption"><span>01 / 04</span><span>Quietly memorable</span></div></div></section><section className="editorial-strip"><div><p className="eyebrow">{t('editorialEyebrow')}</p><h2>{t('editorialTitle')}</h2></div><div className="mini-visuals"><ProductVisual compact tone="#6f8b73" label="Green botanical illustration" /><ProductVisual compact tone="#d6b56d" label="Gold botanical illustration" /><ProductVisual compact tone="#bc6d63" label="Rose botanical illustration" /></div></section></main><SiteFooter /></div>;
}
