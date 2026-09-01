'use client';

import Link from 'next/link';
import { ProductCard } from '@/features/catalog/ProductCard';
import { useCart } from '@/features/cart/CartProvider';
import { useI18n } from '@/features/i18n/I18nProvider';
import { useStorePath } from '@/features/i18n/use-store-path';
import { LOCALES } from '@/lib/locale-routing';
import type { Locale } from '@/features/i18n/types';
import { Button } from '@/components/ui/button';
import { giftFinderReasonKey } from './labels';
import type { GiftFinderOutcome } from './types';

export function GiftFinderResults({ outcome, onRetake }: { outcome: GiftFinderOutcome; onRetake: () => void }) {
  const { locale: rawLocale, t } = useI18n();
  const locale: Locale = (LOCALES as string[]).includes(rawLocale) ? (rawLocale as Locale) : 'en';
  const { href } = useStorePath();
  const { addItem } = useCart();

  if (outcome.status === 'empty' || (outcome.status === 'ok' && outcome.results.length === 0)) {
    return (
      <div className="mx-auto max-w-md py-24 text-center">
        <h1 className="font-display text-3xl font-semibold text-on-surface">{t('giftFinderEmptyHeading')}</h1>
        <p className="mt-3 text-on-surface-variant">{t('giftFinderEmptyLede')}</p>
        <div className="mt-6 flex justify-center gap-3">
          <Button type="button" variant="outline" onClick={onRetake}>{t('giftFinderTryAgain')}</Button>
          <Button asChild><Link href={href('/shop')}>{t('giftFinderShopAll')}</Link></Button>
        </div>
      </div>
    );
  }

  const results = outcome.status === 'ok' ? outcome.results : [];

  return (
    <div className="mx-auto max-w-5xl py-16">
      <div className="mb-8 text-center">
        <p className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-tertiary">{t('giftFinderTitle')}</p>
        <h1 className="font-display text-4xl font-semibold text-on-surface">{t('giftFinderResultsHeading')}</h1>
        <p className="mx-auto mt-2 max-w-sm text-on-surface-variant">{t('giftFinderResultsLede')}</p>
      </div>
      <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
        {results.map(({ product, reasons }) => (
          <div key={product.slug} className="flex flex-col gap-3">
            <ProductCard product={product} locale={locale} href={href} />
            <ul className="flex flex-wrap gap-2">
              {reasons.map((reason) => <li key={reason} className="rounded-full border border-outline-variant/40 px-3 py-1 text-xs text-on-surface-variant">{t(giftFinderReasonKey(reason))}</li>)}
            </ul>
            <Button onClick={() => addItem({ id: `${product.slug}-gift-finder`, productSlug: product.slug, productName: product.name, productNameAr: product.nameAr, productNameFr: product.nameFr, tone: product.tone, imageUrl: product.imageUrl, unitPrice: product.price, quantity: 1, addOns: [], message: '', deliveryDate: '' })}>
              {t('addToBag')}
            </Button>
          </div>
        ))}
      </div>
      <div className="mt-10 text-center">
        <Button type="button" variant="outline" onClick={onRetake}>{t('giftFinderRetake')}</Button>
      </div>
    </div>
  );
}
