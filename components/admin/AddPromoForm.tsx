'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/features/i18n/I18nProvider';
import type { PromoInput } from '@/features/admin/promo-actions';

function toMinor(egp: string): number {
  const parsed = Number.parseFloat(egp);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

const empty = { code: '', type: 'percent' as 'percent' | 'fixed', percent: '10', value: '', minimum: '', startsAt: '', expiresAt: '', maxUses: '0', active: true };

const inputClass = 'h-11 w-full rounded-[10px] border border-border bg-background px-3.5 text-foreground';
const fieldLabelClass = 'grid gap-1.5';

export function AddPromoForm() {
  const router = useRouter();
  const { t } = useI18n();
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  function patch(p: Partial<typeof empty>) { setForm((current) => ({ ...current, ...p })); }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    const body: PromoInput = {
      code: form.code,
      type: form.type,
      percentOff: form.type === 'percent' ? Number.parseInt(form.percent, 10) : null,
      valueMinor: form.type === 'fixed' ? toMinor(form.value) : null,
      minimumOrderMinor: toMinor(form.minimum),
      startsAt: form.startsAt ? `${form.startsAt}T00:00:00Z` : null,
      expiresAt: form.expiresAt ? `${form.expiresAt}T00:00:00Z` : null,
      maxUses: Number.parseInt(form.maxUses, 10),
      active: form.active,
    };
    const response = await fetch('/api/admin/promos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'create-promo', promo: body }) });
    if (!response.ok) { toast.error(response.status === 409 ? t('codeExists') : t('couldNotCreatePromo')); setSaving(false); return; }
    toast.success(t('promoCreated'));
    router.refresh();
    setForm(empty);
  }

  return <form className="grid max-w-[60rem] gap-6" onSubmit={submit} noValidate>
    <section className="grid gap-4 border-b py-6"><p className="text-xs font-bold uppercase tracking-[.16em] text-sage">{t('addPromo')}</p><div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
      <label className={fieldLabelClass}><span className="text-sm font-bold text-foreground">{t('promoCode')}</span><input className={inputClass} type="text" value={form.code} onChange={(e) => patch({ code: e.target.value })} placeholder="ROSE10" required /></label>
      <label className={fieldLabelClass}><span className="text-sm font-bold text-foreground">{t('promoType')}</span><select className={inputClass} value={form.type} onChange={(e) => patch({ type: e.target.value as 'percent' | 'fixed' })}><option value="percent">{t('percentOff')}</option><option value="fixed">{t('amountEgp')}</option></select></label>
      {form.type === 'percent' ? <label className={fieldLabelClass}><span className="text-sm font-bold text-foreground">{t('percentOff')}</span><input className={inputClass} type="number" min="0" max="100" value={form.percent} onChange={(e) => patch({ percent: e.target.value })} required /></label> : <label className={fieldLabelClass}><span className="text-sm font-bold text-foreground">{t('amountEgp')}</span><input className={inputClass} type="number" min="0" step="0.01" value={form.value} onChange={(e) => patch({ value: e.target.value })} required /></label>}
      <label className={fieldLabelClass}><span className="text-sm font-bold text-foreground">{t('minimumOrderEgp')}</span><input className={inputClass} type="number" min="0" step="0.01" value={form.minimum} onChange={(e) => patch({ minimum: e.target.value })} /></label>
      <label className={fieldLabelClass}><span className="text-sm font-bold text-foreground">{t('starts')}</span><input className={inputClass} type="date" value={form.startsAt} onChange={(e) => patch({ startsAt: e.target.value })} /></label>
      <label className={fieldLabelClass}><span className="text-sm font-bold text-foreground">{t('expires')}</span><input className={inputClass} type="date" value={form.expiresAt} onChange={(e) => patch({ expiresAt: e.target.value })} /></label>
      <label className={fieldLabelClass}><span className="text-sm font-bold text-foreground">{t('maxUses')}</span><input className={inputClass} type="number" min="0" value={form.maxUses} onChange={(e) => patch({ maxUses: e.target.value })} /></label>
      <label className="col-span-2 flex items-center gap-3 rounded-2xl border border-border bg-card p-4 max-md:col-span-1"><input type="checkbox" checked={form.active} onChange={(e) => patch({ active: e.target.checked })} className="accent-primary" /><span>{t('active')}</span></label>
    </div></section>
    <Button type="submit" disabled={saving}>{saving ? t('saving') : t('addPromo')}</Button>
  </form>;
}
