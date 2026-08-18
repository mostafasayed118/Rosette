'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StatusMessage } from '@/components/ui/status-message';
import { useI18n } from '@/features/i18n/I18nProvider';
import { toMinor } from '@/features/admin/money';

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

  return <form className="grid max-w-[60rem] gap-6" onSubmit={submit} noValidate>
    {error ? <StatusMessage title={error} tone="error" /> : null}
    <section className="grid gap-4 border-b py-6"><p className="text-xs font-bold uppercase tracking-[.16em] text-sage">{t('addCity')}</p><div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
      <Field id="code" label={t('codeLabel')} value={form.code} onChange={(e) => patch({ code: e.target.value })} placeholder="greater-cairo" required />
      <Field id="nameEn" label={t('nameEn')} value={form.nameEn} onChange={(e) => patch({ nameEn: e.target.value })} required />
      <Field id="nameAr" label={t('nameAr')} value={form.nameAr} onChange={(e) => patch({ nameAr: e.target.value })} required />
      <Field id="fee" label={t('feeEgp')} type="number" min={0} step="0.01" value={form.fee} onChange={(e) => patch({ fee: e.target.value })} required />
      <Field id="minimum" label={t('minimumOrderEgp')} type="number" min={0} step="0.01" value={form.minimum} onChange={(e) => patch({ minimum: e.target.value })} />
      <div className="grid gap-1.5"><span className="text-sm font-bold text-foreground">{t('cutoffHour')}</span><Select value={form.cutoff} onValueChange={(v) => patch({ cutoff: v })}><SelectTrigger id="cutoff"><SelectValue /></SelectTrigger><SelectContent>{HOURS.map((h) => <SelectItem key={h} value={String(h)}>{h}:00</SelectItem>)}</SelectContent></Select></div>
      <label className="col-span-2 flex items-center gap-3 rounded-2xl border border-border bg-card p-4 max-md:col-span-1 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"><input type="checkbox" checked={form.sameDay} onChange={(e) => patch({ sameDay: e.target.checked })} className="accent-primary" /><span>{t('sameDayAvailable')}</span></label>
    </div></section>
    <Button type="submit" disabled={saving}>{saving ? t('saving') : t('addCity')}</Button>
  </form>;
}
