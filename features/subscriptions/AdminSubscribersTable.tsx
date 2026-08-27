'use client';

import { useI18n } from '@/features/i18n/I18nProvider';
import { Button } from '@/components/ui/button';

export type AdminSubscriberRow = { id: string; planName: string; status: string; frequency: string; bundleSize: number; priceMinor: number; customerEmail: string; createdAt: string };

export function AdminSubscribersTable({ rows, onCancel }: { rows: AdminSubscriberRow[]; onCancel?: (id: string) => void }) {
  const { t } = useI18n();
  if (rows.length === 0) return <p className="py-6 text-sm text-on-surface-variant">{t('subscriptionsEmpty')}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-outline-variant/30">
            <th className="py-3 font-mono text-[0.875rem] font-normal text-on-surface-variant">{t('subscriptionPlan')}</th>
            <th className="py-3 font-mono text-[0.875rem] font-normal text-on-surface-variant">{t('status')}</th>
            <th className="py-3 font-mono text-[0.875rem] font-normal text-on-surface-variant">{t('subscriptionFrequency')}</th>
            <th className="py-3 font-mono text-[0.875rem] font-normal text-on-surface-variant">Customer</th>
            <th className="py-3 font-mono text-[0.875rem] font-normal text-on-surface-variant" aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-outline-variant/10">
              <td className="py-3 text-sm text-on-surface">{row.planName}</td>
              <td className="py-3 text-sm text-on-surface-variant">{row.status}</td>
              <td className="py-3 text-sm text-on-surface-variant">{row.frequency} · {row.bundleSize}</td>
              <td className="py-3 text-sm text-on-surface-variant">{row.customerEmail || '—'}</td>
              <td className="py-3 text-right">
                {onCancel && (row.status === 'active' || row.status === 'paused') ? (
                  <Button variant="destructive" size="sm" onClick={() => onCancel(row.id)}>{t('subscriptionCancel')}</Button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
