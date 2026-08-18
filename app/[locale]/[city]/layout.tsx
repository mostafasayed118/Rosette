import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { getCity } from '@/features/destination/data';

export default async function CityLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string; city: string }> }) {
  const { locale, city } = await params;
  if (!getCity(city)) redirect(`/${locale}`);
  return <>{children}</>;
}
