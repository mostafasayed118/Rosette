import Link from 'next/link';
import { getServerT } from '@/features/i18n/server';
import { resolveServerLocale } from '@/features/i18n/server-locale';

export default async function StorefrontNotFound() {
  const locale = await resolveServerLocale();
  const { t } = await getServerT(locale);
  return (
    <main id="main-content" className="mx-auto grid min-h-[70vh] w-[min(calc(100%-3rem),80rem)] place-content-center justify-items-start py-24">
      <p className="price text-xs uppercase tracking-[0.16em] text-sage">404</p>
      <h1 className="mt-3 mb-5 max-w-[16ch] font-display text-[clamp(2.25rem,5vw,3.5rem)] font-semibold leading-[1.08] tracking-[-0.02em] text-primary">
        {t('productNotFoundTitle')}
      </h1>
      <p className="mb-9 max-w-lg text-[1.05rem] leading-relaxed text-on-surface-variant">{t('emptyHint')}</p>
      <Link
        href={`/${locale}`}
        className="lift press inline-flex items-center gap-2 rounded-full bg-primary px-8 py-4 text-sm font-semibold text-on-primary transition-colors hover:bg-on-primary-fixed-variant"
      >
        {t('backCollection')} <span aria-hidden="true">↗</span>
      </Link>
    </main>
  );
}
