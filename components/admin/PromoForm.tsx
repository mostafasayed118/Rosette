'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/features/i18n/I18nProvider';
import type { PromoInput } from '@/features/admin/promo-actions';

function toMinor(egp: string): number {
  const parsed = Number.parseFloat(egp);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

function minorToEgp(minor: number): string {
  return (minor / 100).toFixed(2);
}

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

  return <form className="quantity-control" onSubmit={submit}>
    <select value={type} onChange={(e) => setType(e.target.value as 'percent' | 'fixed')} aria-label={t('promoType')}><option value="percent">%</option><option value="fixed">EGP</option></select>
    {type === 'percent' ? <input type="number" min="0" max="100" value={percent} onChange={(e) => setPercent(e.target.value)} aria-label={t('percentOff')} /> : <input type="number" min="0" step="0.01" value={value} onChange={(e) => setValue(e.target.value)} aria-label={t('amountEgp')} />}
    <input type="number" min="0" step="0.01" value={minimum} onChange={(e) => setMinimum(e.target.value)} aria-label={t('minimumOrderEgp')} />
    <input type="date" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} aria-label={t('starts')} />
    <input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} aria-label={t('expires')} />
    <input type="number" min="0" value={maxUses} onChange={(e) => setMaxUses(e.target.value)} aria-label={t('maxUses')} />
    <label className="choice"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /><span>{t('active')}</span></label>
    <button className="button" type="submit" disabled={saving}>{saving ? t('saving') : t('save')}</button>
    {error ? <small className="field-error">{error}</small> : null}
  </form>;
}
