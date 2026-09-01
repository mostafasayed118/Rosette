import { Fragment } from 'react';
import { getServerT } from '@/features/i18n/server';

const STEPS = [
  { key: 'checkoutStepBag', state: 'complete' },
  { key: 'checkoutStepDelivery', state: 'current' },
  { key: 'checkoutStepPayment', state: 'upcoming' },
] as const;

/**
 * Bag → Delivery → Payment indicator shared by the cart and checkout pages.
 */
export async function CheckoutStepper({ locale }: { locale: string }) {
  const { t } = await getServerT(locale);
  return (
    <div className="mb-10 flex items-center justify-center gap-4 md:gap-8 max-w-2xl mx-auto">
      {STEPS.map((step, index) => (
        <Fragment key={step.key}>
          {index > 0 ? <div className="h-px w-12 md:w-24 bg-outline-variant/50 self-start mt-4 shrink-0" aria-hidden /> : null}
          <div className={`flex flex-col items-center ${step.state === 'upcoming' ? 'opacity-60' : ''}`} aria-current={step.state === 'current' ? 'step' : undefined}>
            <div
              className={`w-8 h-8 rounded-full grid place-items-center font-mono text-[13px] tracking-[0.05em] ${
                step.state === 'complete'
                  ? 'bg-primary text-on-primary'
                  : step.state === 'current'
                    ? 'border border-primary text-primary bg-surface-container-low'
                    : 'border border-outline-variant text-outline-variant'
              }`}
            >
              {index + 1}
            </div>
            <span
              className={`mt-2 text-sm ${
                step.state === 'complete'
                  ? 'font-medium text-primary'
                  : step.state === 'current'
                    ? 'font-medium text-on-surface'
                    : 'text-on-surface-variant'
              }`}
            >
              {t(step.key)}
            </span>
          </div>
        </Fragment>
      ))}
    </div>
  );
}
