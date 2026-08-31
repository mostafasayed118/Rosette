import Link from 'next/link';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { Button } from '@/components/ui/button';
import { getServerT } from '@/features/i18n/server';
import { resolveServerLocale } from '@/features/i18n/server-locale';

/**
 * Product-scoped 404. Reached via `notFound()` for unknown slugs, so the
 * response carries a real HTTP 404 status.
 */
export default async function ProductNotFound() {
  const locale = await resolveServerLocale();
  const { t } = await getServerT(locale);
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main id="main-content" className="mx-auto grid min-h-[70vh] w-[min(calc(100%-3rem),80rem)] place-content-center justify-items-start py-24">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-sage">{t('productNotFoundEyebrow')}</p>
        <h1 className="mt-3 mb-6 max-w-[14ch] font-display text-[clamp(2.25rem,5vw,3.5rem)] font-semibold leading-[1.08] tracking-[-0.02em] text-primary">
          {t('productNotFoundTitle')}
        </h1>
        <p className="mb-9 max-w-lg text-[1.05rem] leading-relaxed text-on-surface-variant">{t('emptyHint')}</p>
        <Button asChild className="lift press">
          <Link href={`/${locale}`}>{t('backCollection')} ↗</Link>
        </Button>
      </main>
      <SiteFooter locale={locale} />
    </div>
  );
}
