'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

export function SetQuantityForm({ variantId, current }: { variantId: string; current: number }) {
  const router = useRouter();
  const [value, setValue] = useState(String(current));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    const quantity = Number.parseInt(value, 10);
    const response = await fetch('/api/admin/inventory', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ variantId, quantity }) });
    if (!response.ok) {
      setError('Could not update stock.');
      setSaving(false);
      return;
    }
    router.refresh();
  }

  return <form className="quantity-control" onSubmit={submit}>
    <input type="number" min="0" value={value} onChange={(e) => setValue(e.target.value)} aria-label="Set quantity" />
    <button className="button" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Set'}</button>
    {error ? <small className="field-error">{error}</small> : null}
  </form>;
}
