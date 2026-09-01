'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { CartLineItem } from '@/features/cart/CartLineItem';
import { formatMoney } from '@/features/money';
import type { CartLine } from '@/features/cart/types';
import type { Locale } from '@/features/i18n/types';

export type PriceSummaryProps = {
  lines: CartLine[];
  onQuantityChange: (id: string, quantity: number) => void;
  onRemove: (id: string) => void;
  t: (key: string, values?: Record<string, string | number>) => string;
  locale: Locale;
  subtotal: number;
  deliveryFee: number;
  promoDiscount: number;
  displayTotal: number;
  cityLabel: string;
  submitting: boolean;
  backHref: string;
  giftMessage?: string;
};

export function PriceSummary({
  lines,
  onQuantityChange,
  onRemove,
  t,
  locale,
  subtotal,
  deliveryFee,
  promoDiscount,
  displayTotal,
  cityLabel,
  submitting,
  backHref,
  giftMessage,
}: PriceSummaryProps) {
  return (
    <div className="lg:col-span-5 xl:col-span-4 order-1 lg:order-2">
      <div className="sticky top-[calc(var(--site-header-height)+1rem)] bg-surface-container-low rounded-[var(--radius-card)] border border-outline-variant/30 shadow-[var(--shadow-surface)] p-5 md:p-6 flex flex-col gap-6">
        <h3 className="font-display text-[22px] font-medium text-on-surface border-b border-outline-variant/20 pb-4">{t('bagSummary')}</h3>

        <div className="space-y-5">
          {lines.map((line) => (
            <CartLineItem key={line.id} line={line} onQuantityChange={(q) => onQuantityChange(line.id, q)} onRemove={() => onRemove(line.id)} />
          ))}
        </div>

        {giftMessage ? (
          <div className="bg-surface-bright border border-outline-variant/40 rounded-lg p-4 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-16 h-16 bg-primary-fixed/20 rounded-bl-full -mr-8 -mt-8 pointer-events-none" />
            <div className="flex items-center gap-2 mb-2">
              <span className="text-primary text-[18px] leading-none" aria-hidden>
                ♥
              </span>
              <span className="text-[13px] font-medium text-on-surface">{t('giftNoteIncluded')}</span>
            </div>
            <p className="font-display text-[15px] italic leading-relaxed text-on-surface-variant pl-4 border-l-2 border-outline-variant/50">“{giftMessage}”</p>
          </div>
        ) : null}

        <div className="space-y-3 text-[15px] text-on-surface-variant border-t border-outline-variant/20 pt-6">
          <div className="flex justify-between gap-4">
            <span>{t('subtotal')}</span>
            <span className="font-mono text-[14px] tracking-[0.05em] text-on-surface">{formatMoney(subtotal, locale)}</span>
          </div>
          {promoDiscount ? (
            <div className="flex justify-between gap-4 text-success">
              <span>{t('discount')}</span>
              <span className="font-mono text-[14px] tracking-[0.05em]">−{formatMoney(promoDiscount, locale)}</span>
            </div>
          ) : null}
          <div className="flex justify-between gap-4">
            <span>{t('deliveryTo', { city: cityLabel })}</span>
            <span className="font-mono text-[14px] tracking-[0.05em] text-on-surface">{formatMoney(deliveryFee, locale)}</span>
          </div>
          <div className="pt-4 mt-2 border-t border-outline-variant/30 flex justify-between items-end gap-4">
            <span className="text-[18px] font-medium text-on-surface">{t('total')}</span>
            <span className="font-mono text-[20px] font-bold tracking-[0.05em] text-primary">{formatMoney(displayTotal, locale)}</span>
          </div>

          <div className="grid gap-3 border-t border-outline-variant/20 pt-5">
            <Button type="submit" disabled={submitting} className="min-h-12 w-full justify-center text-[15px] font-medium">
              {submitting ? t('processing') : t('placeOrder')} · <span className="font-mono tracking-[0.05em]">{formatMoney(displayTotal, locale)}</span> <span aria-hidden>↗</span>
            </Button>
            <Link href={backHref} className="text-center text-sm font-medium text-on-surface-variant underline underline-offset-4 hover:text-primary focus-visible:text-primary">
              {t('backToBag')}
            </Link>
            <p className="text-center text-xs leading-relaxed text-on-surface-variant">{t('demoDisclosure')}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
