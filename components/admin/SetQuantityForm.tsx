'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/features/i18n/I18nProvider';

export function SetQuantityForm({ variantId, current }: { variantId: string; current: number }) {
  const router = useRouter();
  const { t } = useI18n();
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
      setError(t('couldNotUpdateStock'));
      setSaving(false);
      return;
    }
    router.refresh();
  }

  return <form className="flex items-end justify-end gap-2" onSubmit={submit}>
    <Input className="h-10 w-20" type="number" min={0} value={value} onChange={(e) => setValue(e.target.value)} aria-label={t('setQuantity')} />
    <Button size="sm" type="submit" disabled={saving}>{saving ? t('saving') : t('set')}</Button>
    {error ? <small className="text-sm text-destructive">{error}</small> : null}
  </form>;
}
