'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { useI18n } from '@/features/i18n/I18nProvider';
import type { PromoInput } from '@/features/admin/promo-actions';

function toMinor(egp: string): number {
  const parsed = Number.parseFloat(egp);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

const empty = { code: '', type: 'percent' as 'percent' | 'fixed', percent: '10', value: '', minimum: '', startsAt: '', expiresAt: '', maxUses: '0', active: true };

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
      active: form.active,
    };
    const response = await fetch('/api/admin/promos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'create-promo', promo: body }) });
    if (!response.ok) { setError(response.status === 409 ? t('codeExists') : t('couldNotCreatePromo')); setSaving(false); return; }
    router.refresh();
    setForm(empty);
  }

  return <form className="checkout-form" onSubmit={submit} noValidate>
    {error ? <div className="status-message" role="alert"><strong>{error}</strong></div> : null}
    <section className="form-section"><p className="eyebrow">{t('addPromo')}</p><div className="form-grid">
      <label className="field"><span>{t('promoCode')}</span><input type="text" value={form.code} onChange={(e) => patch({ code: e.target.value })} placeholder="ROSE10" required /></label>
      <label className="field"><span>{t('promoType')}</span><select value={form.type} onChange={(e) => patch({ type: e.target.value as 'percent' | 'fixed' })}><option value="percent">{t('percentOff')}</option><option value="fixed">{t('amountEgp')}</option></select></label>
      {form.type === 'percent' ? <label className="field"><span>{t('percentOff')}</span><input type="number" min="0" max="100" value={form.percent} onChange={(e) => patch({ percent: e.target.value })} required /></label> : <label className="field"><span>{t('amountEgp')}</span><input type="number" min="0" step="0.01" value={form.value} onChange={(e) => patch({ value: e.target.value })} required /></label>}
      <label className="field"><span>{t('minimumOrderEgp')}</span><input type="number" min="0" step="0.01" value={form.minimum} onChange={(e) => patch({ minimum: e.target.value })} /></label>
      <label className="field"><span>{t('starts')}</span><input type="date" value={form.startsAt} onChange={(e) => patch({ startsAt: e.target.value })} /></label>
      <label className="field"><span>{t('expires')}</span><input type="date" value={form.expiresAt} onChange={(e) => patch({ expiresAt: e.target.value })} /></label>
      <label className="field"><span>{t('maxUses')}</span><input type="number" min="0" value={form.maxUses} onChange={(e) => patch({ maxUses: e.target.value })} /></label>
      <label className="choice span-two"><input type="checkbox" checked={form.active} onChange={(e) => patch({ active: e.target.checked })} /><span>{t('active')}</span></label>
    </div></section>
    <Button type="submit" disabled={saving}>{saving ? t('saving') : t('addPromo')}</Button>
  </form>;
}
