'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/features/i18n/I18nProvider';

export function PayDifferenceButton({ requestId }: { requestId: string }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function pay() {
    setBusy(true);
    setError('');
    const response = await fetch(`/api/account/change-requests/${requestId}/pay`, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
    if (!response.ok) { setError(t('couldNotStartDeltaPayment')); setBusy(false); return; }
    const body = (await response.json()) as { checkoutUrl?: string };
    if (body.checkoutUrl) window.open(body.checkoutUrl, '_blank');
    setBusy(false);
  }

  return <span className="flex items-center gap-3"><Button size="sm" onClick={pay} disabled={busy}>{t('payDifference')}</Button>{error ? <small className="text-sm text-destructive">{error}</small> : null}</span>;
}
