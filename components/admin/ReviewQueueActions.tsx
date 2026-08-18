'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/features/i18n/I18nProvider';

export function ReviewQueueActions({ reviewId }: { reviewId: string }) {
  const router = useRouter();
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function review(action: 'approve' | 'reject') {
    setBusy(true);
    setError(false);
    const response = await fetch(`/api/admin/reviews/${reviewId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) });
    if (!response.ok) { setError(true); setBusy(false); return; }
    router.refresh();
  }

  return (
    <span className="inline-flex items-center gap-2">
      <Button size="sm" onClick={() => review('approve')} disabled={busy}>{t('approveReview')}</Button>
      <Button size="sm" variant="outline" onClick={() => review('reject')} disabled={busy}>{t('rejectReview')}</Button>
      {error ? <small className="text-sm text-destructive">{t('reviewActionFailed')}</small> : null}
    </span>
  );
}
