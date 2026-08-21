import { SiteFooter } from '@/components/layout/SiteFooter';
import { DestinationGate } from '@/features/destination/DestinationGate';
import type { Locale } from '@/features/i18n/types';
import { LOCALES } from '@/lib/locale-routing';

export default async function CityPickerPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const resolved: Locale = (LOCALES as string[]).includes(locale) ? (locale as Locale) : 'en';
  return (
    <div className="flex min-h-screen flex-col bg-surface selection:bg-primary-fixed selection:text-on-primary-fixed">
      <main className="flex-1 flex flex-col">
        <DestinationGate locale={resolved} />
      </main>
      <SiteFooter />
    </div>
  );
}
