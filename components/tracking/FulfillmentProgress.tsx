import { Check } from 'lucide-react';
import { StatusMessage } from '@/components/ui/status-message';
import { getServerT } from '@/features/i18n/server';
import { FULFILLMENT_STEPS, FULFILLMENT_STEP_KEYS, fulfillmentStepIndex } from '@/features/tracking/fulfillment-progress';
import type { FulfillmentStatus } from '@/features/commerce/order-state';

export async function FulfillmentProgress({ status, locale }: { status: FulfillmentStatus; locale?: string }) {
  const { t } = await getServerT(locale);
  const current = fulfillmentStepIndex(status);
  if (current < 0) return <StatusMessage title={t('statusCancelled')} tone="error" />;

  return (
    <ol className="grid gap-4 md:grid-cols-5 md:gap-2">
      {FULFILLMENT_STEPS.map((step, index) => {
        const done = index < current;
        const isCurrent = index === current;
        const active = done || isCurrent;
        return (
          <li key={step} className="flex items-center gap-3 md:flex-col md:items-start md:gap-2">
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold ${active ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background text-muted-foreground'}`}>
              {done ? <Check className="h-4 w-4" /> : index + 1}
            </span>
            <div className="grid gap-0.5">
              <span className={`text-sm ${active ? 'font-bold text-foreground' : 'text-muted-foreground'}`}>{t(FULFILLMENT_STEP_KEYS[step] ?? step)}</span>
              {isCurrent ? <span className="text-xs font-bold uppercase tracking-[.12em] text-sage">{t('currentStep')}</span> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
