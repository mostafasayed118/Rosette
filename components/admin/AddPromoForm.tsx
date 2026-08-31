'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StatusMessage } from '@/components/ui/status-message';
import { useI18n } from '@/features/i18n/I18nProvider';
import { toMinor } from '@/features/admin/money';
import type { PromoInput } from '@/features/admin/promo-actions';

const empty = { code: '', type: 'percent' as 'percent' | 'fixed', percent: '10', value: '', minimum: '', startsAt: '', expiresAt: '', maxUses: '0', perUserLimit: '0', active: true };

export function AddPromoForm() {
  const router = useRouter();
  const { t } = useI18n();
  const [form, setForm] = useState(empty);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function patch(p: Partial<typeof empty>) { setForm((current) => ({ ...current, ...p })); }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    const body: PromoInput = {
      code: form.code,
      type: form.type,
      percentOff: form.type === 'percent' ? Number.parseInt(form.percent, 10) : null,
      valueMinor: form.type === 'fixed' ? toMinor(form.value) : null,
      minimumOrderMinor: toMinor(form.minimum),
      startsAt: form.startsAt ? `${form.startsAt}T00:00:00Z` : null,
      expiresAt: form.expiresAt ? `${form.expiresAt}T00:00:00Z` : null,
      maxUses: Number.parseInt(form.maxUses, 10),
      perUserLimit: Number.parseInt(form.perUserLimit, 10),
      active: form.active,
    };
    const response = await fetch('/api/admin/promos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'create-promo', promo: body }) });
    if (!response.ok) { setError(response.status === 409 ? t('codeExists') : t('couldNotCreatePromo')); setSaving(false); return; }
    router.refresh();
    setForm(empty);
  }

  return <form className="grid max-w-[60rem] gap-6" onSubmit={submit} noValidate>
    {error ? <StatusMessage title={error} tone="error" /> : null}
    <section className="grid gap-4 border-b py-6"><p className="text-xs font-bold uppercase tracking-[.16em] text-sage">{t('addPromo')}</p><div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
      <Field id="promo-code" label={t('promoCode')} value={form.code} onChange={(e) => patch({ code: e.target.value })} placeholder="ROSE10" required />
      <div className="grid gap-1.5"><span className="text-sm font-bold text-foreground">{t('promoType')}</span><Select value={form.type} onValueChange={(v) => patch({ type: v as 'percent' | 'fixed' })}><SelectTrigger id="promo-type"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="percent">{t('percentOff')}</SelectItem><SelectItem value="fixed">{t('amountEgp')}</SelectItem></SelectContent></Select></div>
      {form.type === 'percent'
        ? <Field id="percent-off" label={t('percentOff')} type="number" min={0} max={100} value={form.percent} onChange={(e) => patch({ percent: e.target.value })} required />
        : <Field id="amount-egp" label={t('amountEgp')} type="number" min={0} step="0.01" value={form.value} onChange={(e) => patch({ value: e.target.value })} required />}
      <Field id="minimum-order" label={t('minimumOrderEgp')} type="number" min={0} step="0.01" value={form.minimum} onChange={(e) => patch({ minimum: e.target.value })} />
      <Field id="starts-at" label={t('starts')} type="date" value={form.startsAt} onChange={(e) => patch({ startsAt: e.target.value })} />
      <Field id="expires-at" label={t('expires')} type="date" value={form.expiresAt} onChange={(e) => patch({ expiresAt: e.target.value })} />
      <Field id="max-uses" label={t('maxUses')} type="number" min={0} value={form.maxUses} onChange={(e) => patch({ maxUses: e.target.value })} />
      <label className="col-span-2 flex items-center gap-3 rounded-2xl border border-border bg-card p-4 max-md:col-span-1 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"><input type="checkbox" checked={form.active} onChange={(e) => patch({ active: e.target.checked })} className="accent-primary" /><span>{t('active')}</span></label>
    </div></section>
    <Button type="submit" disabled={saving}>{saving ? t('saving') : t('addPromo')}</Button>
  </form>;
}
