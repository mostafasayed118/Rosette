'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TurnstileWidget } from '@/components/security/TurnstileWidget';
import { formatMoney } from '@/features/money';
import { errorId, stitchInput, stitchLabel } from './useCheckout';
import type { PromoCodeState } from '@/features/promo/usePromoCode';
import type { CheckoutInput, PaymentMethod } from './types';
import type { Locale } from '@/features/i18n/types';

export type PaymentStepProps = {
  t: (key: string, values?: Record<string, string | number>) => string;
  locale: Locale;
  availablePaymentMethods: PaymentMethod[];
  paymentMethod: CheckoutInput['paymentMethod'];
  update: <K extends keyof CheckoutInput>(key: K, value: CheckoutInput[K]) => void;
  promo: PromoCodeState;
  giftCardCode?: string;
  simulateFailure: boolean;
  setSimulateFailure: (value: boolean) => void;
  turnstileSiteKey?: string;
  setTurnstileToken: (value: string) => void;
};

export function PaymentStep({
  t,
  locale,
  availablePaymentMethods,
  paymentMethod,
  update,
  promo,
  giftCardCode,
  simulateFailure,
  setSimulateFailure,
  turnstileSiteKey,
  setTurnstileToken,
}: PaymentStepProps) {
  return (
    <section className="bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-[0_10px_48px_-12px_rgba(94,89,80,0.06)] p-5 md:p-7">
      <h2 className="font-display text-[22px] md:text-[24px] font-medium leading-tight text-on-surface">{t('paymentMethod')}</h2>

      <fieldset className="mt-5 grid gap-3">
        <legend className="sr-only">{t('paymentMethod')}</legend>
        <div className="grid gap-3">
          {availablePaymentMethods.map((method) => {
            const label = method === 'paymob' ? (t('paymob') as string) : method === 'pay-on-delivery' ? (t('payDelivery') as string) : (t('demoCard') as string);
            const isCard = method === 'paymob' || method === 'demo-card';
            const checked = paymentMethod === method;
            return (
              <label
                key={method}
                className={
                  checked
                    ? 'relative flex cursor-pointer rounded-xl border-2 border-primary bg-surface-container-low p-4 transition-colors outline-none has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-ring'
                    : 'relative flex cursor-pointer rounded-xl border border-outline-variant/50 bg-surface-container-lowest p-4 hover:bg-surface-container-low transition-colors outline-none has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-ring'
                }
              >
                <input
                  type="radio"
                  name="paymentMethod"
                  value={method}
                  checked={checked}
                  onChange={() => update('paymentMethod', method as CheckoutInput['paymentMethod'])}
                  className="peer sr-only"
                />
                <span className="pointer-events-none absolute inset-0 rounded-xl border-2 border-transparent peer-checked:border-primary transition-colors" aria-hidden />
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-outline-variant peer-checked:border-primary transition-colors">
                  <span className={checked ? 'h-2.5 w-2.5 rounded-full bg-primary' : 'h-2.5 w-2.5 rounded-full bg-transparent'} />
                </span>
                <span className="ml-3 flex w-full items-center justify-between gap-3">
                  <span className="flex items-center gap-3">
                    <span className="grid h-8 w-8 place-items-center rounded-full bg-surface-container text-on-surface-variant text-sm" aria-hidden>
                      {isCard ? '💳' : '💵'}
                    </span>
                    <span className="text-[15px] font-medium text-on-surface">{label}</span>
                  </span>
                  {method === 'paymob' ? (
                    <span className="hidden sm:flex items-center gap-1.5">
                      <span className="rounded bg-surface-dim px-1.5 py-1 text-[10px] font-bold leading-none text-on-surface-variant">VISA</span>
                      <span className="rounded bg-surface-dim px-1.5 py-1 text-[10px] font-bold leading-none text-on-surface-variant">MC</span>
                    </span>
                  ) : null}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="mt-6 grid gap-4">
        <div className="grid gap-1.5">
          <Label className={stitchLabel} htmlFor="promoCode">
            {t('promoCode')}
          </Label>
          <div className="flex gap-2">
            <Input id="promoCode" type="text" value={promo.code} onChange={(e) => promo.setCode(e.target.value)} aria-label={t('promoCode') as string} placeholder="ROSETTE10" className={stitchInput + ' rounded-md'} />
            <Button type="button" variant="outline" size="sm" onClick={promo.confirm} className="shrink-0 rounded-full">
              {t('applyPromo')}
            </Button>
          </div>
          {promo.state === 'valid' ? (
            <small className="text-sm text-success">
              {t('promoApplied')} — <span className="font-mono tracking-[0.05em]">{formatMoney(promo.discountMinor ?? 0, locale)}</span>
            </small>
          ) : promo.error ? (
            <small className="text-sm text-destructive">
              {promo.error === 'below_minimum' ? t('promoBelowMinimum') : promo.error === 'not_found' ? t('promoNotFound') : t('promoInvalid')}
            </small>
          ) : null}
        </div>

        <div className="grid gap-1.5">
          <Label className={stitchLabel} htmlFor="giftCardCode">
            {t('giftCardCode')}
          </Label>
          <Input
            id="giftCardCode"
            type="text"
            autoComplete="off"
            placeholder="•••• •••• ••••"
            value={giftCardCode ?? ''}
            onChange={(e) => update('giftCardCode', e.target.value)}
            aria-label={t('giftCardCode') as string}
            className={stitchInput + ' rounded-md'}
          />
        </div>

        <label className="flex items-center gap-3 rounded-xl border border-outline-variant/40 bg-surface-container-low/60 p-4 cursor-pointer has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-ring">
          <input type="checkbox" checked={simulateFailure} onChange={(e) => setSimulateFailure(e.target.checked)} className="accent-primary h-4 w-4 rounded border-outline-variant" />
          <span className="text-sm text-on-surface">{t('simulateFailure')}</span>
        </label>

        {turnstileSiteKey ? (
          <TurnstileWidget siteKey={turnstileSiteKey} onVerify={setTurnstileToken} onExpire={() => setTurnstileToken('')} onError={() => setTurnstileToken('')} />
        ) : null}
      </div>
    </section>
  );
}
