'use client';
import Link from 'next/link';
import { useI18n } from '@/features/i18n/I18nProvider';
export type SubscriptionListItem = { id: string; planNameEn: string; status: string; frequency: string; bundleSize: number; priceMinor: number; firstDeliveryDate: string; orderedCount: number };
export function SubscriptionsPanel({ items, accountPath }: { items: SubscriptionListItem[]; accountPath: string }) {
  const { t } = useI18n();
  if (items.length === 0) return <p className="py-6 text-sm text-on-surface-variant">{t('subscriptionsEmpty')}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-outline-variant/30">
            <th className="py-3 font-mono text-[0.875rem] font-normal text-on-surface-variant">{t('subscriptionPlan')}</th>
            <th className="py-3 font-mono text-[0.875rem] font-normal text-on-surface-variant">{t('status')}</th>
            <th className="py-3 font-mono text-[0.875rem] font-normal text-on-surface-variant">{t('subscriptionProgress')}</th>
            <th className="py-3 font-mono text-[0.875rem] font-normal text-on-surface-variant">{t('subscriptionNextDelivery')}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-b border-outline-variant/10 transition-colors hover:bg-surface-container-low">
              <td className="py-4 text-sm text-on-surface">
                <Link className="underline decoration-transparent underline-offset-4 hover:decoration-outline-variant" href={`${accountPath}/subscriptions/${item.id}`}>{item.planNameEn}</Link>
              </td>
              <td className="py-4 text-sm text-on-surface-variant">{item.status}</td>
              <td className="py-4 text-sm text-on-surface-variant">{item.orderedCount} of {item.bundleSize}</td>
              <td className="py-4 text-sm text-on-surface-variant">{item.firstDeliveryDate}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
