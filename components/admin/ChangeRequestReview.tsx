'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/features/i18n/I18nProvider';

export function ChangeRequestReview({ requestId }: { requestId: string }) {
  const router = useRouter();
  const { t } = useI18n();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function review(action: 'approve' | 'reject') {
    setBusy(true);
    setError('');
    const response = await fetch(`/api/admin/change-requests/${requestId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, reason: action === 'reject' && reason.trim() ? reason.trim() : undefined }) });
    if (!response.ok) { setError(t('couldNotReviewChange')); setBusy(false); return; }
    router.refresh();
  }

  return <div className="grid gap-2"><Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder={t('rejectionReason')} /><span className="flex items-center gap-2"><Button size="sm" onClick={() => review('approve')} disabled={busy}>{t('approveCancellation')}</Button><Button size="sm" variant="outline" onClick={() => review('reject')} disabled={busy}>{t('rejectCancellation')}</Button>{error ? <small className="text-sm text-destructive">{error}</small> : null}</span></div>;
}
