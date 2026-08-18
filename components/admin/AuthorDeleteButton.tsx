'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/features/i18n/I18nProvider';

export function AuthorDeleteButton({ id }: { id: string }) {
  const router = useRouter();
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function remove() {
    setBusy(true);
    setError('');
    const response = await fetch(`/api/admin/authors/${id}`, { method: 'DELETE' });
    if (!response.ok) { setError(t('couldNotDeleteAuthor')); setBusy(false); return; }
    router.refresh();
  }
  return <span className="flex items-center gap-2"><Button variant="ghost" size="sm" onClick={remove} disabled={busy}>{busy ? t('deleting') : t('delete')}</Button>{error ? <small className="text-sm text-destructive">{error}</small> : null}</span>;
}
