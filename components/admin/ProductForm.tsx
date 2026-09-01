'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StatusMessage } from '@/components/ui/status-message';
import { ImagePreview } from '@/components/admin/ImagePreview';
import { minorToEgp, toMinor } from '@/features/admin/money';
import { CATEGORIES, OCCASIONS, type SaveProductInput } from '@/features/admin/catalog-validation';
import { GIFT_RECIPIENTS, GIFT_STYLES, GIFT_COLORS } from '@/features/gift-finder/tags';
import { useI18n } from '@/features/i18n/I18nProvider';

export type ProductFormInitial = SaveProductInput & { id: string };

type VariantEntry = SaveProductInput['variants'][number];
type AddOnEntry = SaveProductInput['addOns'][number];

const emptyVariant = (): VariantEntry => ({ nameEn: '', nameAr: '', priceDeltaMinor: 0, active: true, quantity: 0 });
const emptyAddOn = (): AddOnEntry => ({ id: '', nameEn: '', nameAr: '', priceMinor: 0 });


export function ProductForm({ initial }: { initial?: ProductFormInitial }) {
  const router = useRouter();
  const { t } = useI18n();
  const [product, setProduct] = useState<SaveProductInput>(initial ?? {
    nameEn: '', nameAr: '', descriptionEn: '', descriptionAr: '', category: CATEGORIES[0] ?? 'hand-bouquet', occasions: [],
    giftRecipients: [], giftStyles: [], giftColors: [],
    priceMinor: 0, tone: '#bc6d63', imageUrl: '', delivery: 'Next-day delivery', active: true,
    variants: [emptyVariant()], addOns: [],
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function patch(p: Partial<SaveProductInput>) { setProduct((current) => ({ ...current, ...p })); }
  function updateVariant(index: number, patchValue: Partial<VariantEntry>) {
    setProduct((current) => ({ ...current, variants: current.variants.map((v, i) => (i === index ? { ...v, ...patchValue } : v)) }));
  }
  function updateAddOn(index: number, patchValue: Partial<AddOnEntry>) {
    setProduct((current) => ({ ...current, addOns: current.addOns.map((a, i) => (i === index ? { ...a, ...patchValue } : a)) }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    const response = initial
      ? await fetch(`/api/admin/products/${initial.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ product }) })
      : await fetch('/api/admin/products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ product }) });
    if (!response.ok) {
      setError(t('couldNotSaveProduct'));
      setSaving(false);
      return;
    }
    router.push('/admin/products');
    router.refresh();
  }

  return <form className="grid max-w-[60rem] gap-6 pt-6" onSubmit={submit} noValidate>
    {error ? <StatusMessage title={error} tone="error" /> : null}

    <section className="grid gap-4 border-b py-6"><p className="text-xs font-bold uppercase tracking-[.16em] text-sage">{t('identity')}</p><div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
      <Field id="nameEn" label={t('nameEn')} value={product.nameEn} onChange={(e) => patch({ nameEn: e.target.value })} required />
      <Field id="nameAr" label={t('nameAr')} value={product.nameAr} onChange={(e) => patch({ nameAr: e.target.value })} required />
      <Field id="descriptionEn" label={t('descriptionEn')} className="col-span-2 max-md:col-span-1" value={product.descriptionEn} onChange={(e) => patch({ descriptionEn: e.target.value })} />
      <Field id="descriptionAr" label={t('descriptionAr')} className="col-span-2 max-md:col-span-1" value={product.descriptionAr} onChange={(e) => patch({ descriptionAr: e.target.value })} />
    </div></section>

    <section className="grid gap-4 border-b py-6"><p className="text-xs font-bold uppercase tracking-[.16em] text-sage">{t('catalogOperations')}</p><div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
      <div className="grid gap-1.5"><span className="text-sm font-bold text-foreground">{t('category')}</span><Select value={product.category} onValueChange={(v) => patch({ category: v })}><SelectTrigger id="category"><SelectValue /></SelectTrigger><SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div>
      <Field id="price" label={t('priceEgp')} type="number" min={0} step="0.01" value={minorToEgp(product.priceMinor)} onChange={(e) => patch({ priceMinor: toMinor(e.target.value) })} required />
      <Field id="tone" label={t('toneHex')} type="text" pattern="#[0-9a-fA-F]{6}" value={product.tone} onChange={(e) => patch({ tone: e.target.value })} required />
      <Field id="delivery" label={t('deliveryCopy')} type="text" value={product.delivery} onChange={(e) => patch({ delivery: e.target.value })} required />
      <Field id="imageUrl" label={t('imageUrl')} className="col-span-2 max-md:col-span-1" type="url" value={product.imageUrl} onChange={(e) => patch({ imageUrl: e.target.value })} placeholder="https://…" />
      <div className="col-span-2 max-md:col-span-1 mt-2">
        <ImagePreview url={product.imageUrl} kind="product" fallback={<span className="text-xs text-muted-foreground">{t('noImage')}</span>} />
      </div>
      <fieldset className="col-span-2 grid gap-2.5 border-0 p-0 max-md:col-span-1"><legend className="mb-1.5 font-bold">{t('occasionsLabel')}</legend><div className="flex flex-wrap gap-2.5">{OCCASIONS.map((o) => <label className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring" key={o}><input type="checkbox" checked={product.occasions.includes(o)} onChange={(e) => patch({ occasions: e.target.checked ? [...product.occasions, o] : product.occasions.filter((x) => x !== o) })} className="accent-primary" /><span>{o}</span></label>)}</div></fieldset>
      <fieldset className="col-span-2 grid gap-2.5 border-0 p-0 max-md:col-span-1"><legend className="mb-1.5 font-bold">{t('giftRecipientsLabel')}</legend><div className="flex flex-wrap gap-2.5">{GIFT_RECIPIENTS.map((r) => <label className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring" key={r}><input type="checkbox" checked={product.giftRecipients.includes(r)} onChange={(e) => patch({ giftRecipients: e.target.checked ? [...product.giftRecipients, r] : product.giftRecipients.filter((x) => x !== r) })} className="accent-primary" /><span>{r}</span></label>)}</div></fieldset>
      <fieldset className="col-span-2 grid gap-2.5 border-0 p-0 max-md:col-span-1"><legend className="mb-1.5 font-bold">{t('giftStylesLabel')}</legend><div className="flex flex-wrap gap-2.5">{GIFT_STYLES.map((s) => <label className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring" key={s}><input type="checkbox" checked={product.giftStyles.includes(s)} onChange={(e) => patch({ giftStyles: e.target.checked ? [...product.giftStyles, s] : product.giftStyles.filter((x) => x !== s) })} className="accent-primary" /><span>{s}</span></label>)}</div></fieldset>
      <fieldset className="col-span-2 grid gap-2.5 border-0 p-0 max-md:col-span-1"><legend className="mb-1.5 font-bold">{t('giftColorsLabel')}</legend><div className="flex flex-wrap gap-2.5">{GIFT_COLORS.map((c) => <label className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring" key={c}><input type="checkbox" checked={product.giftColors.includes(c)} onChange={(e) => patch({ giftColors: e.target.checked ? [...product.giftColors, c] : product.giftColors.filter((x) => x !== c) })} className="accent-primary" /><span>{c}</span></label>)}</div></fieldset>
      <label className="col-span-2 flex items-center gap-3 rounded-2xl border border-border bg-card p-4 max-md:col-span-1 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"><input type="checkbox" checked={product.active} onChange={(e) => patch({ active: e.target.checked })} className="accent-primary" /><span>{t('activeVisible')}</span></label>
    </div></section>

    <section className="grid gap-4 border-b py-6"><p className="text-xs font-bold uppercase tracking-[.16em] text-sage">{t('variantsStock')}</p>
      {product.variants.map((variant, index) => (
        <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1" key={variant.id ?? `new-${index}`}>
          <Field id={`variant-en-${index}`} label={t('variantEn')} value={variant.nameEn} onChange={(e) => updateVariant(index, { nameEn: e.target.value })} required />
          <Field id={`variant-ar-${index}`} label={t('variantAr')} value={variant.nameAr} onChange={(e) => updateVariant(index, { nameAr: e.target.value })} />
          <Field id={`variant-delta-${index}`} label={t('priceDeltaEgp')} type="number" step="0.01" value={minorToEgp(variant.priceDeltaMinor)} onChange={(e) => updateVariant(index, { priceDeltaMinor: toMinor(e.target.value) })} />
          <Field id={`variant-qty-${index}`} label={t('stockLabel')} type="number" min="0" value={String(variant.quantity)} onChange={(e) => updateVariant(index, { quantity: Math.max(0, Number.parseInt(e.target.value || '0', 10)) })} />
          <label className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"><input type="checkbox" checked={variant.active} onChange={(e) => updateVariant(index, { active: e.target.checked })} className="accent-primary" /><span>{t('active')}</span></label>
          {!variant.id ? <Button type="button" variant="outline" onClick={() => setProduct((current) => ({ ...current, variants: current.variants.filter((_, i) => i !== index) }))}>{t('remove')}</Button> : null}
        </div>
      ))}
      <Button type="button" variant="outline" onClick={() => patch({ variants: [...product.variants, emptyVariant()] })}>{t('addVariant')}</Button>
    </section>

    <section className="grid gap-4 border-b py-6"><p className="text-xs font-bold uppercase tracking-[.16em] text-sage">{t('addOnsLabel')}</p>
      {product.addOns.map((addOn, index) => (
        <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1" key={index}>
          <Field id={`addon-id-${index}`} label={t('keyId')} value={addOn.id} onChange={(e) => updateAddOn(index, { id: e.target.value })} required />
          <Field id={`addon-en-${index}`} label={t('nameEn')} value={addOn.nameEn} onChange={(e) => updateAddOn(index, { nameEn: e.target.value })} required />
          <Field id={`addon-ar-${index}`} label={t('nameAr')} value={addOn.nameAr} onChange={(e) => updateAddOn(index, { nameAr: e.target.value })} />
          <Field id={`addon-price-${index}`} label={t('priceEgp')} type="number" step="0.01" value={minorToEgp(addOn.priceMinor)} onChange={(e) => updateAddOn(index, { priceMinor: toMinor(e.target.value) })} />
          <Button type="button" variant="outline" onClick={() => setProduct((current) => ({ ...current, addOns: current.addOns.filter((_, i) => i !== index) }))}>{t('remove')}</Button>
        </div>
      ))}
      <Button type="button" variant="outline" onClick={() => patch({ addOns: [...product.addOns, emptyAddOn()] })}>{t('addAddOn')}</Button>
    </section>

    <Button type="submit" disabled={saving}>{saving ? t('saving') : initial ? t('saveProduct') : t('createProduct')}</Button>
  </form>;
}
