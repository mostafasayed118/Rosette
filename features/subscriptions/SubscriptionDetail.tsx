'use client';

import { useI18n } from '@/features/i18n/I18nProvider';
import { SubscriptionActions } from './SubscriptionActions';

export type SubscriptionDetailData = {
  id: string; status: string; frequency: string; bundleSize: number; priceMinor: number;
  planNameEn: string; planNameAr: string; planNameFr: string;
  recipientName: string; recipientPhone: string; deliveryAddress: string; deliveryCityCode: string;
  deliveryWindow: string; giftMessage: string; firstDeliveryDate: string;
  deliveries: Array<{ id: string; position: number; scheduledDate: string; status: string; orderId: string | null }>;
};

export function SubscriptionDetail({ data, accountPath }: { data: SubscriptionDetailData; accountPath: string }) {
  const { t, locale } = useI18n();
  const planName = locale === 'ar' ? data.planNameAr || data.planNameEn : locale === 'fr' ? data.planNameFr || data.planNameEn : data.planNameEn;
  return (
    <section className="grid gap-8">
      <header className="grid gap-3 border-b border-outline-variant/25 pb-8">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-sage">{t('subscriptionsTitle')}</p>
        <h1 className="font-display text-[clamp(2rem,4vw,3rem)] font-semibold leading-[1.05] tracking-[-0.02em] text-primary">{planName}</h1>
        <p className="text-sm text-on-surface-variant">{t('status')}: {data.status} · {t('subscriptionProgress')}: {data.deliveries.filter((d) => d.status === 'ordered').length} / {data.bundleSize}</p>
      </header>

      <div className="grid gap-2 rounded-lg border border-outline-variant/20 p-4 text-sm">
        <p className="font-medium">{data.recipientName}</p>
        <p className="text-on-surface-variant">{data.recipientPhone}</p>
        <p className="text-on-surface-variant">{data.deliveryAddress} · {data.deliveryCityCode} · {data.deliveryWindow}</p>
        {data.giftMessage ? <p className="text-on-surface-variant italic">&ldquo;{data.giftMessage}&rdquo;</p> : null}
      </div>

      <SubscriptionActions subscriptionId={data.id} status={data.status} basePath={accountPath} />

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-outline-variant/30">
              <th className="py-3 font-mono text-[0.875rem] font-normal text-on-surface-variant">#</th>
              <th className="py-3 font-mono text-[0.875rem] font-normal text-on-surface-variant">{t('subscriptionNextDelivery')}</th>
              <th className="py-3 font-mono text-[0.875rem] font-normal text-on-surface-variant">{t('status')}</th>
            </tr>
          </thead>
          <tbody>
            {data.deliveries.map((d) => (
              <tr key={d.id} className="border-b border-outline-variant/10">
                <td className="py-3 text-sm text-on-surface-variant">{d.position}</td>
                <td className="py-3 text-sm text-on-surface">{d.scheduledDate}</td>
                <td className="py-3 text-sm text-on-surface-variant">{d.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
