import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { LOCALES } from '@/lib/locale-routing';

export default async function LocaleLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!(LOCALES as string[]).includes(locale)) notFound();
  return <>{children}</>;
}
