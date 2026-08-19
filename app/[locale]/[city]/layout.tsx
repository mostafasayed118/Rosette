import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { CartSync } from '@/features/cart/CartSync';
import { getCity, getCityBySlug } from '@/features/destination/data';

export default async function CityLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string; city: string }> }) {
  const { locale, city: citySegment } = await params;
  const city = getCityBySlug(citySegment) ?? getCity(citySegment);
  if (!city) redirect(`/${locale}`);
  if (city.slug !== citySegment) redirect(`/${locale}/${city.slug}`);
  return <><CartSync />{children}</>;
}
