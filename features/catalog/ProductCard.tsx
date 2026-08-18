'use client';

import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { ProductVisual } from '@/components/ui/ProductVisual';
import { useI18n } from '@/features/i18n/I18nProvider';
import { useStorePath } from '@/features/i18n/use-store-path';
import { pickLocalized } from '@/features/i18n/pick';
import { formatMoney } from '@/features/money';
import { categoryMessageKeys } from './catalog-labels';
import type { Product } from './types';

export function ProductCard({ product }: { product: Product }) {
  const { locale, t } = useI18n();
  const { href } = useStorePath();
  const name = pickLocalized(locale, { en: product.name, ar: product.nameAr, fr: product.nameFr });
  const description = pickLocalized(locale, { en: product.description, ar: product.descriptionAr, fr: product.descriptionFr });
  const delivery = product.delivery.startsWith('Same-day') ? t('sameDay') : t('nextDay');
  return (
    <Card className="group min-w-0 overflow-hidden transition-transform hover:-translate-y-1">
      <Link href={href(`/shop/${product.slug}`)}>
        <div className="overflow-hidden rounded-none">
          <ProductVisual compact tone={product.tone} imageUrl={product.imageUrl} label={`${name} visual`} className="min-h-[270px] w-full" />
        </div>
        <CardContent className="pt-4">
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[.16em] text-sage">{t(categoryMessageKeys[product.category] ?? 'category')}</p>
              <h3 className="mt-1 font-display text-2xl leading-tight">{name}</h3>
            </div>
            <strong className="whitespace-nowrap text-sm font-bold text-primary">{t('from')} {formatMoney(product.price, locale)}</strong>
          </div>
          <p className="mt-2.5 mb-3 text-sm text-muted-foreground">{description}</p>
          <p className="text-xs text-sage">{delivery}</p>
        </CardContent>
      </Link>
    </Card>
  );
}
