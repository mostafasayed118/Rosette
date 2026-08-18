'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { ProductVisual } from '@/components/ui/ProductVisual';
import { useCart } from '@/features/cart/CartProvider';
import { useI18n } from '@/features/i18n/I18nProvider';
import { pickLocalized } from '@/features/i18n/pick';
import { formatMoney } from '@/features/money';
import { categoryMessageKeys, variantMessageKeys } from '@/features/catalog/catalog-labels';
import type { Product } from '@/features/catalog/types';

const choiceClass = 'flex items-center gap-3 rounded-2xl border border-border bg-card p-4 transition-colors has-[:checked]:border-primary has-[:checked]:bg-accent';

export function ProductDetail({ product }: { product: Product }) {
  const { locale, t } = useI18n();
  const { addItem } = useCart();
  const [variantId, setVariantId] = useState(product.variants[0]?.id ?? 'signature');
  const [addOnIds, setAddOnIds] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('2026-08-20');
  const [added, setAdded] = useState(false);
  const variant = product.variants.find((item) => item.id === variantId);
  const addOns = product.addOns.filter((item) => addOnIds.includes(item.id));
  const unitPrice = product.price + (variant?.priceDelta ?? 0);
  const name = pickLocalized(locale, { en: product.name, ar: product.nameAr, fr: product.nameFr });
  const description = pickLocalized(locale, { en: product.description, ar: product.descriptionAr, fr: product.descriptionFr });
  const delivery = product.delivery.startsWith('Same-day') ? t('sameDay') : t('nextDay');
  function addOnLabel(item: Product['addOns'][number]) { return item.id === 'note' ? t('handwrittenNote') : item.id === 'chocolate' ? t('darkChocolate') : item.id === 'balloon' ? t('balloon') : item.name; }
  function toggleAddOn(id: string) { setAddOnIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]); }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    addItem({ id: `${product.slug}-${variantId}-${[...addOnIds].sort().join('-') || 'none'}-${deliveryDate}`, productSlug: product.slug, productName: product.name, productNameAr: product.nameAr, productNameFr: product.nameFr, tone: product.tone, imageUrl: product.imageUrl, unitPrice, quantity: 1, variantId: variant?.id, variantName: variant ? t(variantMessageKeys[variant.id] ?? variant.name) : undefined, addOns, message: message.trim(), deliveryDate });
    setAdded(true);
  }
  return <div className="grid grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)] gap-20 py-12 max-md:grid-cols-1 max-md:gap-8"><div><ProductVisual tone={product.tone} imageUrl={product.imageUrl} label={`${name} visual`} /></div><div><p className="text-xs font-bold uppercase tracking-[.16em] text-sage">{t(categoryMessageKeys[product.category] ?? 'plants')} · {delivery}</p><h1 className="mt-2 mb-4 font-display text-[clamp(2.5rem,6vw,4.5rem)] leading-[.95] tracking-[-.02em]">{name}</h1><p className="text-[1.1rem] text-muted-foreground">{description}</p><p className="my-6 text-lg font-bold text-primary">{t('from')} {formatMoney(unitPrice, locale)}</p><form className="grid gap-5" onSubmit={submit}>{product.variants.length ? <fieldset className="grid gap-2.5 border-0 p-0"><legend className="mb-1.5 font-bold">{t('chooseSize')}</legend>{product.variants.map((item) => <label className={choiceClass} key={item.id}><input type="radio" name="variant" value={item.id} checked={variantId === item.id} onChange={() => setVariantId(item.id)} className="accent-primary" /><span>{t(variantMessageKeys[item.id] ?? item.name)}{item.priceDelta ? ` · +${item.priceDelta / 100} EGP` : ''}</span></label>)}</fieldset> : null}{product.addOns.length ? <fieldset className="grid gap-2.5 border-0 p-0"><legend className="mb-1.5 font-bold">{t('extraThoughtful')}</legend>{product.addOns.map((item) => <label className={choiceClass} key={item.id}><input type="checkbox" checked={addOnIds.includes(item.id)} onChange={() => toggleAddOn(item.id)} className="accent-primary" /><span>{addOnLabel(item)} · +{item.price / 100} EGP</span></label>)}</fieldset> : null}<Field label={t('deliveryDate')} type="date" min="2026-08-17" value={deliveryDate} onChange={(event) => setDeliveryDate(event.target.value)} required /><label className="grid gap-1.5" htmlFor="message"><span className="text-sm font-bold text-foreground">{t('giftNote')} <small>({t('optional')})</small></span><textarea id="message" maxLength={160} value={message} onChange={(event) => setMessage(event.target.value)} placeholder={t('notePlaceholder')} className="min-h-24 w-full resize-y rounded-[10px] border border-border bg-background px-3.5 py-2.5 text-foreground" /></label><Button type="submit">{t('addToBag')} <span aria-hidden="true">↗</span></Button>{added ? <p className="rounded-xl bg-accent p-4 text-primary" role="status">{t('added')} <Link href="/cart" className="underline underline-offset-4">{t('reviewBag')} ↗</Link></p> : null}</form></div></div>;
}
