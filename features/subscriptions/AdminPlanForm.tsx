'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export type AdminPlanFormInitial = {
  id?: string; slug?: string; nameEn?: string; nameAr?: string; nameFr?: string;
  descriptionEn?: string; descriptionAr?: string; descriptionFr?: string;
  frequencies?: string[]; bundlePrices?: Array<{ deliveries: number; priceMinor: number }>;
  productId?: string | null; active?: boolean; sortOrder?: number;
};

const FREQUENCIES = ['weekly', 'biweekly', 'monthly'] as const;

export function AdminPlanForm({ initial = {} }: { initial?: AdminPlanFormInitial }) {
  const router = useRouter();
  const editing = Boolean(initial.id);
  const [slug, setSlug] = useState(initial.slug ?? '');
  const [nameEn, setNameEn] = useState(initial.nameEn ?? '');
  const [nameAr, setNameAr] = useState(initial.nameAr ?? '');
  const [nameFr, setNameFr] = useState(initial.nameFr ?? '');
  const [descriptionEn, setDescriptionEn] = useState(initial.descriptionEn ?? '');
  const [descriptionAr, setDescriptionAr] = useState(initial.descriptionAr ?? '');
  const [descriptionFr, setDescriptionFr] = useState(initial.descriptionFr ?? '');
  const [frequencies, setFrequencies] = useState<string[]>(initial.frequencies ?? ['weekly']);
  const [pricesText, setPricesText] = useState((initial.bundlePrices ?? []).map((bp) => `${bp.deliveries}:${bp.priceMinor}`).join(', '));
  const [active, setActive] = useState(initial.active ?? true);
  const [sortOrder, setSortOrder] = useState(initial.sortOrder ?? 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function toggleFrequency(f: string) {
    setFrequencies((prev) => (prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]));
  }

  function parsePrices() {
    return pricesText.split(',').map((chunk) => chunk.trim()).filter(Boolean).map((chunk) => {
      const parts = chunk.split(':');
      const deliveries = Number(parts[0]);
      const priceMinor = Number(parts[1]);
      return { deliveries, priceMinor };
    }).filter((bp) => Number.isInteger(bp.deliveries) && (bp.deliveries ?? 0) > 0 && Number.isInteger(bp.priceMinor) && (bp.priceMinor ?? 0) > 0) as Array<{ deliveries: number; priceMinor: number }>;
  }

  async function submit() {
    setBusy(true);
    setError('');
    const payload = { slug, nameEn, nameAr, nameFr, descriptionEn, descriptionAr, descriptionFr, frequencies, bundlePrices: parsePrices(), active, sortOrder };
    const response = editing
      ? await fetch(`/api/admin/subscriptions/plans/${initial.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      : await fetch('/api/admin/subscriptions/plans', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      setError(data?.error ?? 'Save failed');
      setBusy(false);
      return;
    }
    router.push('/admin/subscriptions/plans');
    router.refresh();
  }

  return (
    <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="planSlug">Slug</Label>
          <Input id="planSlug" value={slug} disabled={editing} onChange={(e) => setSlug(e.target.value)} required />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="planNameEn">Name (EN)</Label>
          <Input id="planNameEn" value={nameEn} onChange={(e) => setNameEn(e.target.value)} required />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="planNameAr">Name (AR)</Label>
          <Input id="planNameAr" value={nameAr} onChange={(e) => setNameAr(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="planNameFr">Name (FR)</Label>
          <Input id="planNameFr" value={nameFr} onChange={(e) => setNameFr(e.target.value)} />
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <div className="grid gap-1.5">
          <Label htmlFor="planDescEn">Description (EN)</Label>
          <Input id="planDescEn" value={descriptionEn} onChange={(e) => setDescriptionEn(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="planDescAr">Description (AR)</Label>
          <Input id="planDescAr" value={descriptionAr} onChange={(e) => setDescriptionAr(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="planDescFr">Description (FR)</Label>
          <Input id="planDescFr" value={descriptionFr} onChange={(e) => setDescriptionFr(e.target.value)} />
        </div>
      </div>
      <fieldset className="grid gap-2">
        <Label>Frequencies</Label>
        <div className="flex flex-wrap gap-2">
          {FREQUENCIES.map((f) => (
            <button key={f} type="button" onClick={() => toggleFrequency(f)} aria-pressed={frequencies.includes(f)}
              className={`rounded-full px-4 py-2 text-sm transition-colors ${frequencies.includes(f) ? 'bg-primary text-on-primary' : 'border border-outline-variant text-on-surface-variant hover:bg-surface-container'}`}>
              {f}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-4 md:grid-cols-3">
        <div className="grid gap-1.5 md:col-span-2">
          <Label htmlFor="planPrices">Bundle prices (deliveries:priceMinor, comma separated)</Label>
          <Input id="planPrices" value={pricesText} onChange={(e) => setPricesText(e.target.value)} placeholder="4:120000, 8:220000" required />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="planSort">Sort order</Label>
          <Input id="planSort" type="number" value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value))} />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active
      </label>
      <div className="flex justify-end">
        <Button type="submit" disabled={busy}>{editing ? 'Save' : 'Create plan'}</Button>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </form>
  );
}
