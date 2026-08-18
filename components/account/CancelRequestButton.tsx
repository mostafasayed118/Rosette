'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useI18n } from '@/features/i18n/I18nProvider';

export function CancelRequestButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const { t } = useI18n();
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError('');
    const response = await fetch(`/api/account/orders/${orderId}/cancel-request`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: reason.trim() || undefined }) });
    if (!response.ok) { setError(t('couldNotRequestCancellation')); setBusy(false); return; }
    router.refresh();
  }

  return <div className="grid gap-2"><Textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={2} placeholder={t('cancellationReason')} /><Button variant="outline" onClick={submit} disabled={busy}>{t('requestCancellation')}</Button>{error ? <small className="text-sm text-destructive">{error}</small> : null}</div>;
}
