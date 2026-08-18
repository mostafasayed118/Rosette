'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/features/i18n/I18nProvider';

export type DeliveryRuleInitial = { feeMinor: number; minimumOrderMinor: number; cutoffHour: number; active: boolean };

function toMinor(egp: string): number {
  const parsed = Number.parseFloat(egp);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

function minorToEgp(minor: number): string {
  return (minor / 100).toFixed(2);
}

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const inputClass = 'h-10 w-24 rounded-[10px] border border-border bg-background px-3 text-foreground';

export function DeliveryRuleForm({ cityCode, initial }: { cityCode: string; initial: DeliveryRuleInitial }) {
  const router = useRouter();
  const { t } = useI18n();
  const [fee, setFee] = useState(minorToEgp(initial.feeMinor));
  const [minimum, setMinimum] = useState(minorToEgp(initial.minimumOrderMinor));
  const [cutoff, setCutoff] = useState(String(initial.cutoffHour));
  const [active, setActive] = useState(initial.active);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    const response = await fetch('/api/admin/delivery', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update-rule', cityCode, feeMinor: toMinor(fee), minimumOrderMinor: toMinor(minimum), cutoffHour: Number.parseInt(cutoff, 10), active }),
    });
    if (!response.ok) {
      toast.error(t('couldNotSaveRule'));
      setSaving(false);
      return;
    }
    toast.success(t('ruleSaved'));
    router.refresh();
  }

  return <form className="grid items-end gap-2" onSubmit={submit}>
    <input className={inputClass} type="number" min="0" step="0.01" value={fee} onChange={(e) => setFee(e.target.value)} aria-label={t('feeEgp')} />
    <input className={inputClass} type="number" min="0" step="0.01" value={minimum} onChange={(e) => setMinimum(e.target.value)} aria-label={t('minimumOrderEgp')} />
    <select className={inputClass} value={cutoff} onChange={(e) => setCutoff(e.target.value)} aria-label={t('cutoffHour')}>{HOURS.map((h) => <option key={h} value={h}>{h}:00</option>)}</select>
    <label className="flex items-center gap-2"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="accent-primary" /><span className="text-sm">{t('active')}</span></label>
    <Button size="sm" type="submit" disabled={saving}>{saving ? t('saving') : t('save')}</Button>
  </form>;
}
