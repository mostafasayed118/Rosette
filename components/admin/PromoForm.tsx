'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useI18n } from '@/features/i18n/I18nProvider';
import { minorToEgp, toMinor } from '@/features/admin/money';
import type { PromoInput } from '@/features/admin/promo-actions';

export function PromoForm({ promo }: { promo: PromoInput }) {
  const router = useRouter();
  const { t } = useI18n();
  const [type, setType] = useState<'percent' | 'fixed'>(promo.type);
  const [percent, setPercent] = useState(String(promo.percentOff ?? 0));
  const [value, setValue] = useState(minorToEgp(promo.valueMinor ?? 0));
  const [minimum, setMinimum] = useState(minorToEgp(promo.minimumOrderMinor));
  const [startsAt, setStartsAt] = useState(promo.startsAt?.slice(0, 10) ?? '');
  const [expiresAt, setExpiresAt] = useState(promo.expiresAt?.slice(0, 10) ?? '');
  const [maxUses, setMaxUses] = useState(String(promo.maxUses));
  const [active, setActive] = useState(promo.active);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    const body: PromoInput = {
      code: promo.code,
      type,
      percentOff: type === 'percent' ? Number.parseInt(percent, 10) : null,
      valueMinor: type === 'fixed' ? toMinor(value) : null,
      minimumOrderMinor: toMinor(minimum),
      startsAt: startsAt ? `${startsAt}T00:00:00Z` : null,
      expiresAt: expiresAt ? `${expiresAt}T00:00:00Z` : null,
      maxUses: Number.parseInt(maxUses, 10),
      active,
    };
    const response = await fetch('/api/admin/promos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'update-promo', promo: body }) });
    if (!response.ok) { setError(t('couldNotSavePromo')); setSaving(false); return; }
    router.refresh();
  }

  return <form className="flex flex-wrap items-end gap-2" onSubmit={submit}>
    <Select value={type} onValueChange={(v) => setType(v as 'percent' | 'fixed')}>
      <SelectTrigger className="h-10 w-24" aria-label={t('promoType')}><SelectValue /></SelectTrigger>
      <SelectContent><SelectItem value="percent">%</SelectItem><SelectItem value="fixed">EGP</SelectItem></SelectContent>
    </Select>
    {type === 'percent'
      ? <Input className="h-10 w-24" type="number" min={0} max={100} value={percent} onChange={(e) => setPercent(e.target.value)} aria-label={t('percentOff')} />
      : <Input className="h-10 w-28" type="number" min={0} step="0.01" value={value} onChange={(e) => setValue(e.target.value)} aria-label={t('amountEgp')} />}
    <Input className="h-10 w-28" type="number" min={0} step="0.01" value={minimum} onChange={(e) => setMinimum(e.target.value)} aria-label={t('minimumOrderEgp')} />
    <Input className="h-10 w-36" type="date" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} aria-label={t('starts')} />
    <Input className="h-10 w-36" type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} aria-label={t('expires')} />
    <Input className="h-10 w-24" type="number" min={0} value={maxUses} onChange={(e) => setMaxUses(e.target.value)} aria-label={t('maxUses')} />
    <label className="flex h-10 items-center gap-2 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="accent-primary" /><span className="text-sm">{t('active')}</span></label>
    <Button size="sm" type="submit" disabled={saving}>{saving ? t('saving') : t('save')}</Button>
    {error ? <small className="text-sm text-destructive">{error}</small> : null}
  </form>;
}
