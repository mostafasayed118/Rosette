'use client';

import { useRouter } from 'next/navigation';
import { useI18n } from '@/features/i18n/I18nProvider';
import { useAsyncAction } from '@/hooks/useAsyncAction';
import { Button } from '@/components/ui/button';

type Props = { subscriptionId: string; status: string; basePath: string };

async function post(url: string, body?: unknown) {
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!response.ok) throw new Error(String(response.status));
  return response.json();
}

export function SubscriptionActions({ subscriptionId, status, basePath }: Props) {
  const router = useRouter();
  const { t } = useI18n();
  const base = `${basePath}/subscriptions/${subscriptionId}`;

  const pause = useAsyncAction({
    action: async () => { await post(`${base}/pause`); },
    successMessage: () => t('subscriptionPaused'),
    errorMessage: () => t('subscriptionActionFailed'),
    onSuccess: () => router.refresh(),
  });
  const resume = useAsyncAction({
    action: async () => {
      const next = new Date();
      next.setUTCDate(next.getUTCDate() + 2);
      const nextDate = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`;
      await post(`${base}/resume`, { nextDeliveryDate: nextDate });
    },
    successMessage: () => t('subscriptionResumed'),
    errorMessage: () => t('subscriptionActionFailed'),
    onSuccess: () => router.refresh(),
  });
  const cancel = useAsyncAction({
    action: async () => await post(`${base}/cancel`),
    successMessage: (result: any) => (result?.creditMinor ? `${t('subscriptionCancelled')} · ${t('subscriptionCreditIssued')}` : t('subscriptionCancelled')),
    errorMessage: () => t('subscriptionActionFailed'),
    onSuccess: () => router.refresh(),
  });

  if (status !== 'active' && status !== 'paused') return null;

  return (
    <div className="flex flex-wrap gap-2">
      {status === 'active' ? (
        <Button variant="outline" onClick={() => pause.run()} disabled={pause.isPending}>{t('subscriptionPause')}</Button>
      ) : null}
      {status === 'paused' ? (
        <Button variant="outline" onClick={() => resume.run()} disabled={resume.isPending}>{t('subscriptionResume')}</Button>
      ) : null}
      <Button variant="destructive" onClick={() => cancel.run()} disabled={cancel.isPending}>{t('subscriptionCancel')}</Button>
    </div>
  );
}
