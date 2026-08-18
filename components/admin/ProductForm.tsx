'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { CATEGORIES, OCCASIONS, type SaveProductInput } from '@/features/admin/catalog-validation';
import { useI18n } from '@/features/i18n/I18nProvider';

export type ProductFormInitial = SaveProductInput & { id: string };

type VariantEntry = SaveProductInput['variants'][number];
type AddOnEntry = SaveProductInput['addOns'][number];

const emptyVariant = (): VariantEntry => ({ nameEn: '', nameAr: '', priceDeltaMinor: 0, active: true, quantity: 0 });
const emptyAddOn = (): AddOnEntry => ({ id: '', nameEn: '', nameAr: '', priceMinor: 0 });

function toMinor(egp: string): number {
  const parsed = Number.parseFloat(egp);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

function minorToEgp(minor: number): string {
  return (minor / 100).toFixed(2);
}

export function ProductForm({ initial }: { initial?: ProductFormInitial }) {
  const router = useRouter();
  const { t } = useI18n();
  const [product, setProduct] = useState<SaveProductInput>(initial ?? {
    nameEn: '', nameAr: '', descriptionEn: '', descriptionAr: '', category: CATEGORIES[0] ?? 'hand-bouquet', occasions: [],
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

  return <form className="checkout-form" onSubmit={submit} noValidate>
    {error ? <div className="status-message" role="alert"><strong>{error}</strong></div> : null}

    <section className="form-section"><p className="eyebrow">{t('identity')}</p><div className="form-grid">
      <Field id="nameEn" label={t('nameEn')} value={product.nameEn} onChange={(e) => patch({ nameEn: e.target.value })} required />
      <Field id="nameAr" label={t('nameAr')} value={product.nameAr} onChange={(e) => patch({ nameAr: e.target.value })} required />
      <Field id="descriptionEn" label={t('descriptionEn')} className="span-two" value={product.descriptionEn} onChange={(e) => patch({ descriptionEn: e.target.value })} />
      <Field id="descriptionAr" label={t('descriptionAr')} className="span-two" value={product.descriptionAr} onChange={(e) => patch({ descriptionAr: e.target.value })} />
    </div></section>

    <section className="form-section"><p className="eyebrow">{t('catalogOperations')}</p><div className="form-grid">
      <label className="field"><span>{t('category')}</span><select value={product.category} onChange={(e) => patch({ category: e.target.value })}>{CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
      <label className="field"><span>{t('priceEgp')}</span><input type="number" min="0" step="0.01" value={minorToEgp(product.priceMinor)} onChange={(e) => patch({ priceMinor: toMinor(e.target.value) })} required /></label>
      <label className="field"><span>{t('toneHex')}</span><input type="text" pattern="#[0-9a-fA-F]{6}" value={product.tone} onChange={(e) => patch({ tone: e.target.value })} required /></label>
      <label className="field"><span>{t('deliveryCopy')}</span><input type="text" value={product.delivery} onChange={(e) => patch({ delivery: e.target.value })} required /></label>
      <Field id="imageUrl" label={t('imageUrl')} className="span-two" type="url" value={product.imageUrl} onChange={(e) => patch({ imageUrl: e.target.value })} placeholder="https://…" />
      <fieldset className="span-two"><legend>{t('occasionsLabel')}</legend>{OCCASIONS.map((o) => <label className="choice" key={o}><input type="checkbox" checked={product.occasions.includes(o)} onChange={(e) => patch({ occasions: e.target.checked ? [...product.occasions, o] : product.occasions.filter((x) => x !== o) })} /><span>{o}</span></label>)}</fieldset>
      <label className="choice span-two"><input type="checkbox" checked={product.active} onChange={(e) => patch({ active: e.target.checked })} /><span>{t('activeVisible')}</span></label>
    </div></section>

    <section className="form-section"><p className="eyebrow">{t('variantsStock')}</p>
      {product.variants.map((variant, index) => (
        <div className="form-grid" key={variant.id ?? `new-${index}`}>
          <Field id={`variant-en-${index}`} label={t('variantEn')} value={variant.nameEn} onChange={(e) => updateVariant(index, { nameEn: e.target.value })} required />
          <Field id={`variant-ar-${index}`} label={t('variantAr')} value={variant.nameAr} onChange={(e) => updateVariant(index, { nameAr: e.target.value })} />
          <Field id={`variant-delta-${index}`} label={t('priceDeltaEgp')} type="number" step="0.01" value={minorToEgp(variant.priceDeltaMinor)} onChange={(e) => updateVariant(index, { priceDeltaMinor: toMinor(e.target.value) })} />
          <Field id={`variant-qty-${index}`} label={t('stockLabel')} type="number" min="0" value={String(variant.quantity)} onChange={(e) => updateVariant(index, { quantity: Math.max(0, Number.parseInt(e.target.value || '0', 10)) })} />
          <label className="choice"><input type="checkbox" checked={variant.active} onChange={(e) => updateVariant(index, { active: e.target.checked })} /><span>{t('active')}</span></label>
          {!variant.id ? <Button type="button" onClick={() => setProduct((current) => ({ ...current, variants: current.variants.filter((_, i) => i !== index) }))}>{t('remove')}</Button> : null}
        </div>
      ))}
      <Button type="button" onClick={() => patch({ variants: [...product.variants, emptyVariant()] })}>{t('addVariant')}</Button>
    </section>

    <section className="form-section"><p className="eyebrow">{t('addOnsLabel')}</p>
      {product.addOns.map((addOn, index) => (
        <div className="form-grid" key={index}>
          <Field id={`addon-id-${index}`} label={t('keyId')} value={addOn.id} onChange={(e) => updateAddOn(index, { id: e.target.value })} required />
          <Field id={`addon-en-${index}`} label={t('nameEn')} value={addOn.nameEn} onChange={(e) => updateAddOn(index, { nameEn: e.target.value })} required />
          <Field id={`addon-ar-${index}`} label={t('nameAr')} value={addOn.nameAr} onChange={(e) => updateAddOn(index, { nameAr: e.target.value })} />
          <Field id={`addon-price-${index}`} label={t('priceEgp')} type="number" step="0.01" value={minorToEgp(addOn.priceMinor)} onChange={(e) => updateAddOn(index, { priceMinor: toMinor(e.target.value) })} />
          <Button type="button" onClick={() => setProduct((current) => ({ ...current, addOns: current.addOns.filter((_, i) => i !== index) }))}>{t('remove')}</Button>
        </div>
      ))}
      <Button type="button" onClick={() => patch({ addOns: [...product.addOns, emptyAddOn()] })}>{t('addAddOn')}</Button>
    </section>

    <Button type="submit" disabled={saving}>{saving ? t('saving') : initial ? t('saveProduct') : t('createProduct')}</Button>
  </form>;
}
