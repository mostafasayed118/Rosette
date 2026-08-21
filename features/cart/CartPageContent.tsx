'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { StatusMessage } from '@/components/ui/status-message';
import { useI18n } from '@/features/i18n/I18nProvider';
import { useStorePath } from '@/features/i18n/use-store-path';
import { useDeliveryFee } from '@/features/delivery/useDeliveryFee';
import { estimateDeliveryFeeMinor } from '@/features/destination/delivery-fee';
import { getCityBySlug } from '@/features/destination/data';
import { useCart } from './CartProvider';
import { SaveBagField } from './SaveBagField';
import { RestoreCart } from './RestoreCart';
import { CartLineItem } from './CartLineItem';
import { CartSummary } from './CartSummary';
import { calculateCartTotals } from './pricing';

export function CartPageContent({ cityCode }: { cityCode?: string }) {
  const { t } = useI18n();
  const { href } = useStorePath();
  const { cart, ready, updateQuantity, removeItem } = useCart();
  const { feeMinor } = useDeliveryFee(cityCode);
  const deliveryFee = feeMinor ?? estimateDeliveryFeeMinor(cityCode) ?? 1500;
  const totals = calculateCartTotals(cart.lines, cart.lines.length ? deliveryFee : 0);
  if (!ready) return <StatusMessage title={t('openingBag')} />;
  if (!cart.lines.length)
    return (
      <>
        <RestoreCart />
        <StatusMessage title={t('bagWaiting')}>
          <Button asChild>
            <Link href={href('/shop')}>{t('browseCollection')} ↗</Link>
          </Button>
        </StatusMessage>
      </>
    );

  const cityLabel = cityCode ? (getCityBySlug(cityCode)?.name ?? cityCode) : null;
  const deliveryLabel = cityLabel ? `${t('delivery')} — ${cityLabel}` : t('delivery');
  const firstGiftLine = cart.lines.find((l) => l.message?.trim());

  return (
    <>
      <RestoreCart />
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: line items */}
        <div className="lg:col-span-7 xl:col-span-8 flex flex-col gap-6 order-2 lg:order-1">
          <section className="bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-[0_10px_48px_-12px_rgba(94,89,80,0.06)] p-5 md:p-7">
            <div className="flex items-baseline justify-between gap-4 border-b border-outline-variant/20 pb-4 mb-6">
              <h2 className="font-display text-[24px] font-medium leading-tight text-on-surface">{t('bagTitle')}</h2>
              <span className="font-mono text-[12px] tracking-[0.08em] uppercase text-on-surface-variant">
                {cart.lines.length} {cart.lines.length === 1 ? 'item' : 'items'}
              </span>
            </div>
            <div className="space-y-6 divide-y divide-outline-variant/20">
              {cart.lines.map((line) => (
                <div key={line.id} className="pt-6 first:pt-0">
                  <CartLineItem line={line} onQuantityChange={(quantity) => updateQuantity(line.id, quantity)} onRemove={() => removeItem(line.id)} />
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Right: sticky bag summary */}
        <div className="lg:col-span-5 xl:col-span-4 order-1 lg:order-2">
          <div className="sticky top-[100px] bg-surface-container-low rounded-xl border border-outline-variant/30 shadow-[0_10px_48px_-12px_rgba(94,89,80,0.06)] p-5 md:p-6 flex flex-col gap-6">
            <h3 className="font-display text-[22px] font-medium text-on-surface border-b border-outline-variant/20 pb-4">{t('bag')} · Summary</h3>

            {/* collapsed line list for quick review */}
            <div className="space-y-4 border-b border-outline-variant/20 pb-6 hidden lg:block">
              {cart.lines.slice(0, 3).map((line) => (
                <div key={`summary-${line.id}`} className="flex justify-between gap-3 text-sm">
                  <span className="truncate text-on-surface-variant">{line.productName} × {line.quantity}</span>
                  <span className="font-mono text-[12px] text-on-surface shrink-0">
                    {new Intl.NumberFormat('en-EG', { style: 'currency', currency: 'EGP', maximumFractionDigits: 0 }).format(((line.unitPrice + line.addOns.reduce((s, a) => s + a.price, 0)) * line.quantity) / 100)}
                  </span>
                </div>
              ))}
              {cart.lines.length > 3 ? <p className="text-xs text-on-surface-variant">+{cart.lines.length - 3} more</p> : null}
            </div>

            {firstGiftLine?.message ? (
              <div className="bg-surface-bright border border-outline-variant/40 rounded-lg p-4 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-16 h-16 bg-primary-fixed/20 rounded-bl-full -mr-8 -mt-8 pointer-events-none" />
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-primary text-[18px] leading-none" aria-hidden>
                    ♥
                  </span>
                  <span className="text-[13px] font-medium text-on-surface">Gift note</span>
                </div>
                <p className="font-display text-[15px] italic leading-relaxed text-on-surface-variant pl-4 border-l-2 border-outline-variant/50">“{firstGiftLine.message}”</p>
              </div>
            ) : null}

            <CartSummary totals={totals} deliveryLabel={deliveryLabel} />

            <div className="grid gap-3">
              <Button asChild className="w-full justify-center py-6 text-[15px]">
                <Link href={href('/checkout')}>{t('checkout')} ↗</Link>
              </Button>
              <p className="text-center text-xs leading-relaxed text-on-surface-variant">{t('demoCheckout')}</p>
              <div className="pt-2 border-t border-outline-variant/20">
                <SaveBagField />
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
