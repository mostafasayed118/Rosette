import { StatusMessage } from '@/components/ui/status-message';
import { getServerT } from '@/features/i18n/server';
import type { FulfillmentStatus } from '@/features/commerce/order-state';
import { formatStepTime } from '@/features/tracking/progress-format';

type TimelineEntry = { status: FulfillmentStatus; at: string };

const STITCH_STEPS: Array<{ statuses: FulfillmentStatus[]; labelKey: string }> = [
  { statuses: ['confirmed'], labelKey: 'statusConfirmed' },
  { statuses: ['preparing', 'ready_for_delivery'], labelKey: 'statusPreparing' },
  { statuses: ['out_for_delivery'], labelKey: 'statusOutForDelivery' },
  { statuses: ['delivered'], labelKey: 'statusDelivered' },
];

function stitchIndex(status: FulfillmentStatus): number {
  if (status === 'cancelled') return -1;
  if (status === 'confirmed') return 0;
  if (status === 'preparing' || status === 'ready_for_delivery') return 1;
  if (status === 'out_for_delivery') return 2;
  if (status === 'delivered') return STITCH_STEPS.length;
  return -1;
}

export async function FulfillmentProgress({
  status,
  locale,
  timeline,
}: {
  status: FulfillmentStatus;
  locale?: string;
  timeline?: TimelineEntry[];
}) {
  const { t } = await getServerT(locale);
  const current = stitchIndex(status);
  if (current < 0) return <StatusMessage title={t('statusCancelled')} tone="error" />;

  const resolvedLocale = locale ?? 'en';

  return (
    <div className="relative">
      <div className="absolute start-[15px] top-4 bottom-4 w-px bg-outline-variant" aria-hidden="true" />
      <div className="flex flex-col gap-8">
        {STITCH_STEPS.map((step, index) => {
          const isAllDone = current === STITCH_STEPS.length;
          const done = isAllDone ? true : index < current;
          const isCurrent = index === current;
          const future = !done && !isCurrent;
          const entry = timeline?.find((e) => step.statuses.includes(e.status));
          const time = formatStepTime(entry?.at, resolvedLocale, t('trackingPending'));
          // Future states stay visually quiet, but remain readable enough to
          // distinguish a pending step from a broken or missing value.
          return (
            <div key={step.labelKey} className={`flex items-start gap-4 relative z-10 ${future ? 'opacity-80' : ''}`}>
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border bg-surface mt-1 ${done || isCurrent ? 'border-primary' : 'border-outline-variant'} ${isCurrent ? 'relative' : ''}`}
              >
                {isCurrent ? <div className="absolute inset-0 rounded-full border border-primary pulse-ring" aria-hidden="true" /> : null}
                <span className={`rounded-full ${done || isCurrent ? 'h-3 w-3 bg-primary' : 'h-2 w-2 bg-outline-variant'}`} aria-hidden="true" />
              </div>
              <div className="flex flex-col">
                <span className="font-headline-sm text-headline-sm text-on-surface">{t(step.labelKey)}</span>
                <span className="font-meta-mono text-meta-mono text-on-surface-variant mt-1">{time}</span>
                {isCurrent ? <span className="font-body-md text-body-md text-sage-ink mt-2">{t('trackingCurrentStep')}</span> : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
