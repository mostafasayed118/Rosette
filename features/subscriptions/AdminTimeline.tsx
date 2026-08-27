'use client';

import { useI18n } from '@/features/i18n/I18nProvider';

export type AdminTimelineRow = { id: string; scheduledDate: string; status: string; orderId: string | null; planName: string; recipient: string; city: string; window: string };

export function AdminTimeline({ rows }: { rows: AdminTimelineRow[] }) {
  const { t } = useI18n();
  if (rows.length === 0) return <p className="py-6 text-sm text-on-surface-variant">{t('subscriptionsEmpty')}</p>;
  return (
    <ul className="grid gap-2">
      {rows.map((row) => (
        <li key={row.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-outline-variant/20 px-4 py-3 text-sm">
          <span className="font-mono text-on-surface-variant">{row.scheduledDate}</span>
          <span className="font-medium text-on-surface">{row.planName}</span>
          <span className="text-on-surface-variant">{row.recipient} · {row.city} · {row.window}</span>
          <span className="ml-auto text-on-surface-variant">{row.status}{row.orderId ? ` · ${row.orderId.slice(0, 8)}` : ''}</span>
        </li>
      ))}
    </ul>
  );
}
