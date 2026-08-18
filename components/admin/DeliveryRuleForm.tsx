'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

export type DeliveryRuleInitial = { feeMinor: number; minimumOrderMinor: number; cutoffHour: number; active: boolean };

function toMinor(egp: string): number {
  const parsed = Number.parseFloat(egp);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

function minorToEgp(minor: number): string {
  return (minor / 100).toFixed(2);
}

const HOURS = Array.from({ length: 24 }, (_, h) => h);

export function DeliveryRuleForm({ cityCode, initial }: { cityCode: string; initial: DeliveryRuleInitial }) {
  const router = useRouter();
  const [fee, setFee] = useState(minorToEgp(initial.feeMinor));
  const [minimum, setMinimum] = useState(minorToEgp(initial.minimumOrderMinor));
  const [cutoff, setCutoff] = useState(String(initial.cutoffHour));
  const [active, setActive] = useState(initial.active);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    const response = await fetch('/api/admin/delivery', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update-rule', cityCode, feeMinor: toMinor(fee), minimumOrderMinor: toMinor(minimum), cutoffHour: Number.parseInt(cutoff, 10), active }),
    });
    if (!response.ok) {
      setError('Could not save the rule.');
      setSaving(false);
      return;
    }
    router.refresh();
  }

  return <form className="quantity-control" onSubmit={submit}>
    <input type="number" min="0" step="0.01" value={fee} onChange={(e) => setFee(e.target.value)} aria-label="Fee (EGP)" />
    <input type="number" min="0" step="0.01" value={minimum} onChange={(e) => setMinimum(e.target.value)} aria-label="Minimum order (EGP)" />
    <select value={cutoff} onChange={(e) => setCutoff(e.target.value)} aria-label="Cutoff hour">{HOURS.map((h) => <option key={h} value={h}>{h}:00</option>)}</select>
    <label className="choice"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /><span>Active</span></label>
    <button className="button" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
    {error ? <small className="field-error">{error}</small> : null}
  </form>;
}
