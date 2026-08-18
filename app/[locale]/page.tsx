import { SiteFooter } from '@/components/layout/SiteFooter';
import { DestinationGate } from '@/features/destination/DestinationGate';
import type { Locale } from '@/features/i18n/types';
import { LOCALES } from '@/lib/locale-routing';

export default async function CityPickerPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const resolved: Locale = (LOCALES as string[]).includes(locale) ? (locale as Locale) : 'en';
  return (
    <div className="flex min-h-screen flex-col">
      <main className="mx-auto grid w-[min(calc(100%-3rem),80rem)] flex-1 place-content-center py-12">
        <DestinationGate locale={resolved} />
      </main>
      <SiteFooter />
    </div>
  );
}
