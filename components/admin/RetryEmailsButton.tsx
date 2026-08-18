'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { StatusMessage } from '@/components/ui/status-message';
import { useI18n } from '@/features/i18n/I18nProvider';

type RetrySummary = { retried: number; sent: number; failed: number; skipped: number };

export function RetryEmailsButton() {
  const router = useRouter();
  const { t } = useI18n();
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function retry() {
    setRunning(true);
    setResult(null);
    try {
      const response = await fetch('/api/admin/notifications/retry', { method: 'POST' });
      const body = (await response.json()) as { ok?: boolean; summary?: RetrySummary };
      if (!response.ok || !body.summary) {
        setResult({ ok: false, message: t('couldNotRetryEmails') });
      } else {
        const s = body.summary;
        setResult({ ok: true, message: t('retrySummary', { retried: s.retried, sent: s.sent, failed: s.failed, skipped: s.skipped }) });
        router.refresh();
      }
    } catch {
      setResult({ ok: false, message: t('couldNotRetryEmails') });
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="grid gap-3">
      {result ? <StatusMessage title={result.message} tone={result.ok ? 'success' : 'error'} /> : null}
      <Button onClick={() => void retry()} disabled={running}>{running ? t('retrying') : t('retryStuckEmails')}</Button>
    </div>
  );
}
