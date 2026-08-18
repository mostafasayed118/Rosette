'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/features/i18n/I18nProvider';

function toMinor(egp: string): number {
  const parsed = Number.parseFloat(egp);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

const HOURS = Array.from({ length: 24 }, (_, h) => h);

const empty = { code: '', nameEn: '', nameAr: '', sameDay: false, fee: '', minimum: '', cutoff: '14' };

export function AddCityForm() {
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
    const response = await fetch('/api/admin/delivery', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create-city', code: form.code.trim(), nameEn: form.nameEn, nameAr: form.nameAr, sameDay: form.sameDay, feeMinor: toMinor(form.fee), minimumOrderMinor: toMinor(form.minimum), cutoffHour: Number.parseInt(form.cutoff, 10) }),
    });
    if (!response.ok) {
      setError(response.status === 409 ? t('cityCodeExists') : t('couldNotCreateCity'));
      setSaving(false);
      return;
    }
    router.refresh();
    setForm(empty);
  }

  return <form className="checkout-form" onSubmit={submit} noValidate>
    {error ? <div className="status-message" role="alert"><strong>{error}</strong></div> : null}
    <section className="form-section"><p className="eyebrow">{t('addCity')}</p><div className="form-grid">
      <label className="field"><span>{t('codeLabel')}</span><input type="text" value={form.code} onChange={(e) => patch({ code: e.target.value })} placeholder="greater-cairo" required /></label>
      <label className="field"><span>{t('nameEn')}</span><input type="text" value={form.nameEn} onChange={(e) => patch({ nameEn: e.target.value })} required /></label>
      <label className="field"><span>{t('nameAr')}</span><input type="text" value={form.nameAr} onChange={(e) => patch({ nameAr: e.target.value })} required /></label>
      <label className="field"><span>{t('feeEgp')}</span><input type="number" min="0" step="0.01" value={form.fee} onChange={(e) => patch({ fee: e.target.value })} required /></label>
      <label className="field"><span>{t('minimumOrderEgp')}</span><input type="number" min="0" step="0.01" value={form.minimum} onChange={(e) => patch({ minimum: e.target.value })} /></label>
      <label className="field"><span>{t('cutoffHour')}</span><select value={form.cutoff} onChange={(e) => patch({ cutoff: e.target.value })}>{HOURS.map((h) => <option key={h} value={h}>{h}:00</option>)}</select></label>
      <label className="choice span-two"><input type="checkbox" checked={form.sameDay} onChange={(e) => patch({ sameDay: e.target.checked })} /><span>{t('sameDayAvailable')}</span></label>
    </div></section>
    <Button type="submit" disabled={saving}>{saving ? t('saving') : t('addCity')}</Button>
  </form>;
}
