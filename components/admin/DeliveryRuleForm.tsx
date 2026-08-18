'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useI18n } from '@/features/i18n/I18nProvider';
import { minorToEgp, toMinor } from '@/features/admin/money';

export type DeliveryRuleInitial = { feeMinor: number; minimumOrderMinor: number; cutoffHour: number; active: boolean };

const HOURS = Array.from({ length: 24 }, (_, h) => h);

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

  return <form className="flex flex-wrap items-end gap-2" onSubmit={submit}>
    <Input className="h-10 w-24" type="number" min={0} step="0.01" value={fee} onChange={(e) => setFee(e.target.value)} aria-label={t('feeEgp')} />
    <Input className="h-10 w-24" type="number" min={0} step="0.01" value={minimum} onChange={(e) => setMinimum(e.target.value)} aria-label={t('minimumOrderEgp')} />
    <Select value={cutoff} onValueChange={setCutoff}>
      <SelectTrigger className="h-10 w-24" aria-label={t('cutoffHour')}><SelectValue /></SelectTrigger>
      <SelectContent>{HOURS.map((h) => <SelectItem key={h} value={String(h)}>{h}:00</SelectItem>)}</SelectContent>
    </Select>
    <label className="flex h-10 items-center gap-2 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="accent-primary" /><span className="text-sm">{t('active')}</span></label>
    <Button size="sm" type="submit" disabled={saving}>{saving ? t('saving') : t('save')}</Button>
  </form>;
}
