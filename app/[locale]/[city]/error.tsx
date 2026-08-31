'use client';

import { RotateCcw } from 'lucide-react';
import { useI18n } from '@/features/i18n/I18nProvider';
import { useStorePath } from '@/features/i18n/use-store-path';
import Link from 'next/link';

export default function StorefrontError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useI18n();
  const { href } = useStorePath();
  return (
    <main id="main-content" className="mx-auto grid min-h-[70vh] w-[min(calc(100%-3rem),80rem)] place-content-center justify-items-start py-24" role="alert">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-sage">Rosette</p>
      <h1 className="mt-3 mb-5 max-w-[16ch] font-display text-[clamp(2.25rem,5vw,3.5rem)] font-semibold leading-[1.08] tracking-[-0.02em] text-primary">
        {t('temporaryError')}
      </h1>
      <p className="mb-9 max-w-lg text-[1.05rem] leading-relaxed text-on-surface-variant">
        {t('emptyHint')}
      </p>
      <div className="flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={reset}
          className="lift press inline-flex items-center gap-2 rounded-full bg-primary px-8 py-4 text-sm font-semibold text-on-primary transition-colors hover:bg-on-primary-fixed-variant"
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          {t('restoreNow')}
        </button>
        <Link href={href('/shop')} className="text-sm text-primary underline underline-offset-4">
          {t('backCollection')} ↗
        </Link>
      </div>
      {error.digest ? <p className="price mt-8 text-xs text-on-surface-variant/70">ref {error.digest}</p> : null}
    </main>
  );
}
