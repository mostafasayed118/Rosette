'use client';

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Flower2, Droplets, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import { ProductVisual } from '@/components/ui/ProductVisual';
import { WishlistHeart } from '@/components/wishlist/WishlistHeart';
import { useCart } from '@/features/cart/CartProvider';
import { useI18n } from '@/features/i18n/I18nProvider';
import { useStorePath } from '@/features/i18n/use-store-path';
import { pickLocalized } from '@/features/i18n/pick';
import { formatMoney } from '@/features/money';
import { defaultDeliveryDate, minDeliveryDate } from '@/features/delivery/dates';
import { checkDeliveryDate } from '@/features/delivery/eligibility';
import { MAX_LINE_QUANTITY } from '@/features/cart/types';
import { canReserveInventory } from '@/features/inventory/service';
import { trackEvent } from '@/features/analytics/events';
import { categoryMessageKeys, variantMessageKeys } from '@/features/catalog/catalog-labels';
import { addOnLabel } from '@/features/catalog/add-on-labels';
import type { Product } from '@/features/catalog/types';
import { deferToTask } from '@/hooks/use-deferred-task';
import { rosetteToast } from '@/lib/feedback';

export function ProductDetail({ product }: { product: Product }) {
  const { locale, t } = useI18n();
  const { href } = useStorePath();
  const router = useRouter();
  const { addItem } = useCart();
  const [variantId, setVariantId] = useState(product.variants[0]?.id ?? 'signature');
  const [addOnIds, setAddOnIds] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [minDate, setMinDate] = useState('');
  const [added, setAdded] = useState(false);
  const [quantity, setQuantity] = useState(1);
  // Date math runs after hydration so server and client render identical
  // markup regardless of timezone (Cloudflare runs UTC, browsers do not).
  useEffect(() => {
    deferToTask(() => {
      const now = new Date();
      setMinDate(minDeliveryDate(now));
      setDeliveryDate((current) => current || defaultDeliveryDate(now));
    });
  }, []);
  useEffect(() => {
    trackEvent({ event: 'product_view', productSlug: product.slug, locale });
  }, [locale, product.slug]);
  const variant = product.variants.find((item) => item.id === variantId);
  const addOns = product.addOns.filter((item) => addOnIds.includes(item.id));
  const unitPrice = product.price + (variant?.priceDelta ?? 0);
  // Sold-out products must not be purchasable; the server re-checks stock when
  // the order is created, but blocking here avoids a dead-end at checkout.
  const soldOut = !canReserveInventory({ quantity: product.inventory, reserved: 0 });
  const lowStock = !soldOut && product.inventory <= 3;
  const maxQuantity = Math.max(1, Math.min(MAX_LINE_QUANTITY, product.inventory || MAX_LINE_QUANTITY));
  const dateCheck = deliveryDate ? checkDeliveryDate(deliveryDate) : null;
  const dateError = dateCheck && !dateCheck.eligible
    ? (dateCheck.reason === 'closed_weekday' ? t('deliveryClosedWeekday') : t('deliveryInvalidDate'))
    : null;
  const name = pickLocalized(locale, { en: product.name, ar: product.nameAr, fr: product.nameFr });
  const description = pickLocalized(locale, { en: product.description, ar: product.descriptionAr, fr: product.descriptionFr });
  const delivery = product.delivery.startsWith('Same-day') ? t('sameDay') : t('nextDay');
  function toggleAddOn(id: string) { setAddOnIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]); }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (soldOut || dateError) return;
    addItem({ id: `${product.slug}-${variantId}-${[...addOnIds].sort().join('-') || 'none'}-${deliveryDate}`, productSlug: product.slug, productName: product.name, productNameAr: product.nameAr, productNameFr: product.nameFr, tone: product.tone, imageUrl: product.imageUrl, unitPrice, quantity, variantId: variant?.id, variantName: variant ? t(variantMessageKeys[variant.id] ?? variant.name) : undefined, addOns, message: message.trim(), deliveryDate });
    trackEvent({ event: 'add_to_cart', productSlug: product.slug, locale, metadata: { quantity, has_variant: Boolean(variant?.id), add_on_count: addOns.length } });
    rosetteToast.success(t('toastAddedToBag'), {
      description: `${name} · ×${quantity} · ${formatMoney(unitPrice * quantity, locale)}`,
      action: { label: t('toastViewBag'), onClick: () => router.push(href('/cart')) },
    })
    setAdded(true);
    window.setTimeout(() => setAdded(false), 2600);
  }
  const variantPill = (active: boolean) => `press cursor-pointer rounded-full border px-6 py-3 text-sm font-medium transition-all duration-300 outline-none has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-ring ${active ? 'border-2 border-primary bg-primary-fixed/25 text-on-surface shadow-[0_4px_14px_-4px_rgb(58_20_30_/_25%)]' : 'border border-outline-variant/50 bg-surface text-on-surface hover:-translate-y-0.5 hover:bg-surface-container'}`;
  const addOnPill = (active: boolean) => `press flex cursor-pointer items-center gap-3 rounded-full border px-5 py-3 text-sm transition-all duration-300 outline-none has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-ring ${active ? 'border-2 border-primary bg-primary-fixed/25 shadow-[0_4px_14px_-4px_rgb(58_20_30_/_25%)]' : 'border border-outline-variant/50 bg-surface hover:-translate-y-0.5 hover:bg-surface-container'}`;

  return (
    <div className="grid grid-cols-1 gap-10 py-12 md:grid-cols-12 md:gap-12 items-start">
      {/* Gallery — 7 cols */}
      <div className="flex flex-col-reverse gap-4 md:col-span-7 md:flex-row">
        <div className="hidden shrink-0 md:flex md:w-24 md:flex-col gap-3">
          <span className="h-32 w-24 overflow-hidden rounded border-2 border-primary opacity-100"><ProductVisual tone={product.tone} imageUrl={product.imageUrl} label={`${name} thumb`} className="h-full w-full" /></span>
        </div>
        <div className="w-full overflow-hidden rounded-[var(--radius-card)] border border-outline-variant/30 bg-surface-container-low shadow-[var(--shadow-surface)]">
          <ProductVisual tone={product.tone} imageUrl={product.imageUrl} label={`${name} visual`} className="aspect-[4/5] w-full md:aspect-[3/4]" />
        </div>
      </div>

      {/* Details — 5 cols */}
      <div className="flex flex-col gap-6 md:col-span-5">
        <div className="flex flex-col gap-2">
          <p className="text-sm font-bold uppercase tracking-[0.12em] text-sage-ink">{t(categoryMessageKeys[product.category] ?? 'plants')} · {delivery}</p>
          <h1 className="font-display text-[42px] font-semibold leading-[1.1] tracking-[-0.02em] text-on-surface md:text-[48px]">{name}</h1>
          <p className="price text-lg font-medium text-on-surface-variant">{t('from')} {formatMoney(unitPrice, locale)}</p>
          {product.rating && product.rating.count > 0 ? <p className="text-sm text-muted-foreground">★ {product.rating.average.toFixed(1)} · {product.rating.count}</p> : null}
          <p className="max-w-prose text-[1.05rem] leading-relaxed text-on-surface-variant">{description}</p>
          <Link href={href('/gift-finder')} className="mt-1 text-sm text-primary underline underline-offset-4 hover:text-on-primary-fixed-variant">{t('giftFinderPdpLink')} ↗</Link>
        </div>

        <form className="grid gap-6" onSubmit={submit}>
          {product.variants.length ? (
            <fieldset className="grid gap-3 border-0 p-0">
              <legend className="price text-xs font-medium uppercase tracking-widest text-on-surface-variant">{t('chooseSize')}</legend>
              <div className="flex flex-wrap gap-3">
                {product.variants.map((item) => (
                  <label key={item.id} className={variantPill(variantId === item.id)}>
                    <input type="radio" name="variant" value={item.id} checked={variantId === item.id} onChange={() => setVariantId(item.id)} className="sr-only" />
                    <span>{t(variantMessageKeys[item.id] ?? item.name)}</span>{item.priceDelta ? <span className="price ml-1 text-sm font-medium text-on-surface-variant">+{formatMoney(item.priceDelta, locale)}</span> : null}
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}

          {product.addOns.length ? (
            <fieldset className="grid gap-3 border-0 p-0">
              <legend className="price text-xs font-medium uppercase tracking-widest text-on-surface-variant">{t('extraThoughtful')}</legend>
              <div className="flex flex-wrap gap-3">
                {product.addOns.map((item) => (
                  <label key={item.id} className={addOnPill(addOnIds.includes(item.id))}>
                    <input type="checkbox" checked={addOnIds.includes(item.id)} onChange={() => toggleAddOn(item.id)} className="sr-only" />
                    <span>{addOnLabel(item, t)}</span><span className="price text-xs text-on-surface-variant">+{formatMoney(item.price, locale)}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}

          <div className="grid gap-3 border-t border-outline-variant/30 pt-4">
            <label className="flex items-center justify-between text-sm text-on-surface-variant" htmlFor="message">
              <span>{t('giftNote')}</span><span className="price text-xs opacity-60">({t('optional')})</span>
            </label>
            <Textarea id="message" maxLength={160} value={message} onChange={(event) => setMessage(event.target.value)} placeholder={t('notePlaceholder')} className="min-h-20 border-x-0 border-b border-t-0 border-outline-variant/50 bg-surface-container-low focus:border-primary focus:ring-0" />
          </div>

          <div className="grid gap-3">
            <Field label={t('deliveryDate')} type="date" min={minDate} value={deliveryDate} onChange={(event) => setDeliveryDate(event.target.value)} aria-invalid={Boolean(dateError)} required />
            {dateError ? <small role="alert" className="text-sm text-destructive">{dateError}</small> : null}
          </div>

          <div className="grid gap-2">
            <span className="price text-xs font-medium uppercase tracking-widest text-on-surface-variant" id="quantity-label">{t('quantity')}</span>
            <div className="flex items-center gap-1">
              <button type="button" className="press grid h-11 w-11 place-items-center rounded-full border border-outline-variant/50 bg-surface text-on-surface transition-colors hover:bg-surface-container disabled:cursor-not-allowed disabled:opacity-40" aria-label={t('decreaseQuantity')} disabled={quantity <= 1} onClick={() => setQuantity((current) => Math.max(1, current - 1))}>−</button>
              <input id="quantity" type="number" inputMode="numeric" min={1} max={maxQuantity} value={quantity} aria-labelledby="quantity-label" onChange={(event) => {
                const next = Number.parseInt(event.target.value, 10);
                setQuantity(Number.isNaN(next) ? 1 : Math.min(maxQuantity, Math.max(1, next)));
              }} className="h-11 w-16 rounded-full border border-outline-variant/50 bg-surface text-center text-on-surface" />
              <button type="button" className="press grid h-11 w-11 place-items-center rounded-full border border-outline-variant/50 bg-surface text-on-surface transition-colors hover:bg-surface-container disabled:cursor-not-allowed disabled:opacity-40" aria-label={t('increaseQuantity')} disabled={quantity >= maxQuantity} onClick={() => setQuantity((current) => Math.min(maxQuantity, current + 1))}>+</button>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button
              type="submit"
              disabled={soldOut || Boolean(dateError)}
              aria-live="polite"
              className={`lift press flex-1 justify-center gap-2 py-6 text-base font-semibold disabled:cursor-not-allowed disabled:opacity-60 transition-all ${added ? "bg-[var(--color-success-token)] text-white hover:bg-[var(--color-success-token)]/90" : ""}`}
            >
              {added ? (
                <span className="inline-flex items-center gap-2">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 13l4 4L19 7" /></svg>
                  {t('added')}
                </span>
              ) : soldOut ? (
                t('soldOut')
              ) : (
                t('addToBag')
              )}
              {soldOut || added ? null : <span className="price border-l border-on-primary/30 pl-3 text-sm opacity-80">{formatMoney(unitPrice * quantity, locale)}</span>}
            </Button>
            <WishlistHeart slug={product.slug} productName={name} />
          </div>
          {lowStock ? <p className="text-sm text-on-surface-variant" role="status">{t('onlyLeft', { count: product.inventory })}</p> : null}
        </form>

        <div className="grid grid-cols-3 gap-6 border-t border-outline-variant/20 pt-6">
          <span className="flex flex-col items-center gap-2 text-center"><Truck className="h-8 w-8 text-secondary" strokeWidth={1.75} /><span className="text-xs leading-tight text-on-surface-variant">{t('badgeSameDay')}</span></span>
          <span className="flex flex-col items-center gap-2 text-center"><Flower2 className="h-8 w-8 text-secondary" strokeWidth={1.75} /><span className="text-xs leading-tight text-on-surface-variant">{t('badgeHandTied')}</span></span>
          <span className="flex flex-col items-center gap-2 text-center"><Droplets className="h-8 w-8 text-secondary" strokeWidth={1.75} /><span className="text-xs leading-tight text-on-surface-variant">{t('badgeCare')}</span></span>
        </div>
      </div>
    </div>
  );
}
