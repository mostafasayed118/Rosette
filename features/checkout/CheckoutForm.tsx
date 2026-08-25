'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StatusMessage } from '@/components/ui/status-message';
import { defaultDeliveryDate, minDeliveryDate } from '@/features/delivery/dates';
import { calculateCartTotals } from '@/features/cart/pricing';
import { useCart } from '@/features/cart/CartProvider';
import { CartLineItem } from '@/features/cart/CartLineItem';
import { useDeliveryFee } from '@/features/delivery/useDeliveryFee';
import { usePromoCode } from '@/features/promo/usePromoCode';
import { estimateDeliveryFeeMinor } from '@/features/destination/delivery-fee';
import { getCityBySlug } from '@/features/destination/data';
import { useI18n } from '@/features/i18n/I18nProvider';
import { useStorePath } from '@/features/i18n/use-store-path';
import { formatMoney } from '@/features/money';
import { createLocalOrder } from '@/features/order/local-repository';
import { SignedInNotice } from './SignedInNotice';
import { validateCheckout } from './validation';
import type { CheckoutErrors, CheckoutInput } from './types';
import type { PaymentMethod } from './types';

const defaultPaymentMethods: PaymentMethod[] = ['paymob', 'pay-on-delivery', 'demo-card'];

type OrderApiResponse = { orderId?: string; checkoutUrl?: string | null; error?: string };

const stitchInput =
  'h-auto w-full rounded-t-md rounded-b-none border-0 border-b border-outline-variant bg-surface-container-low px-4 py-3 text-[15px] leading-normal text-on-surface placeholder:text-on-surface-variant/60 shadow-none focus-visible:border-primary focus-visible:ring-0 focus-visible:ring-offset-0';
const stitchLabel = 'text-[14px] font-medium text-on-surface-variant';

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function CheckoutForm({ cityCode, availablePaymentMethods = defaultPaymentMethods }: { cityCode: string; availablePaymentMethods?: PaymentMethod[] }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const { href } = useStorePath();
  const { cart, ready, clearCart, updateQuantity, removeItem } = useCart();
  const { feeMinor } = useDeliveryFee(cityCode);
  const deliveryFee = feeMinor ?? estimateDeliveryFeeMinor(cityCode) ?? 1500;
  const totals = calculateCartTotals(cart.lines, cart.lines.length ? deliveryFee : 0);
  const subtotalOnly = calculateCartTotals(cart.lines, 0).subtotal;
  const promo = usePromoCode(subtotalOnly);
  const promoDiscount = promo.discountMinor ?? 0;
  const displayTotal = Math.max(0, totals.total - promoDiscount);
  const [input, setInput] = useState<CheckoutInput>(() => ({
    recipientName: '',
    recipientPhone: '',
    address: '',
    senderName: '',
    senderEmail: '',
    deliveryDate: '',
    deliveryWindow: '12-3',
    paymentMethod: availablePaymentMethods[0] ?? 'pay-on-delivery',
  }));
  const [errors, setErrors] = useState<CheckoutErrors>({});
  const [simulateFailure, setSimulateFailure] = useState(false);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [minDate, setMinDate] = useState('');
  // Date defaults are applied after hydration so server (UTC) and client
  // markup agree even when timezones straddle midnight.
  useEffect(() => {
    const now = new Date();
    setMinDate(minDeliveryDate(now));
    setInput((current) => current.deliveryDate ? current : { ...current, deliveryDate: defaultDeliveryDate(now) });
  }, []);

  function update<K extends keyof CheckoutInput>(key: K, value: CheckoutInput[K]) {
    setInput((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validateCheckout(input);
    setErrors(nextErrors);
    const firstError = Object.keys(nextErrors)[0] as keyof CheckoutInput | undefined;
    if (firstError) {
      document.getElementById(firstError)?.focus();
      return;
    }
    setSubmitting(true);
    setMessage('');
    const destination = { countryCode: 'EG', cityCode };

    try {
      if (input.paymentMethod === 'paymob') {
        const response = await fetch('/api/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cart, destination, checkout: { ...input, promoCode: promo.state === 'valid' ? promo.code.trim() : undefined }, locale }),
        });
        const data = (await response.json()) as OrderApiResponse;
        if (!response.ok || !data.orderId) {
          setMessage(data.error ?? t('orderCreateFailed'));
          return;
        }
        if (!data.checkoutUrl) {
          setMessage(t('onlinePaymentNotConfigured'));
          return;
        }
        clearCart();
        window.location.assign(data.checkoutUrl);
        return;
      }

      const result = createLocalOrder({
        cart,
        destination,
        recipient: { name: input.recipientName, phone: input.recipientPhone },
        sender: { name: input.senderName, email: input.senderEmail },
        delivery: { address: input.address, date: input.deliveryDate, window: input.deliveryWindow },
        paymentMethod: input.paymentMethod,
        simulatePaymentFailure: simulateFailure,
      });
      if (!result.ok) {
        setMessage(t('demoPaymentFailed'));
        return;
      }
      clearCart();
      router.push(href(`/orders/${result.value.id}`));
    } catch {
      setMessage(t('temporaryError'));
    } finally {
      setSubmitting(false);
    }
  }

  if (!ready) return <StatusMessage title={t('openingBag')} />;
  if (!cart.lines.length) return <StatusMessage title={t('bagWaiting')} />;

  const todayISO = toISODate(new Date());
  const tomorrowISO = toISODate(new Date(Date.now() + 86400000));
  const nextDay2ISO = toISODate(new Date(Date.now() + 86400000 * 2));
  const cityLabel = getCityBySlug(cityCode)?.name ?? cityCode;
  const firstGiftLine = cart.lines.find((l) => l.message?.trim());

  const deliveryDateOptions: Array<{ label: string; sub: string; value: string; weekday?: string }> = [
    { label: 'Today', sub: new Date(todayISO).toLocaleDateString(locale === 'ar' ? 'ar-EG' : 'en-GB', { month: 'short', day: 'numeric' }), value: todayISO },
    { label: 'Tomorrow', sub: new Date(tomorrowISO).toLocaleDateString(locale === 'ar' ? 'ar-EG' : 'en-GB', { month: 'short', day: 'numeric' }), value: tomorrowISO },
    {
      label: new Date(nextDay2ISO).toLocaleDateString('en-GB', { weekday: 'short' }),
      sub: new Date(nextDay2ISO).toLocaleDateString(locale === 'ar' ? 'ar-EG' : 'en-GB', { month: 'short', day: 'numeric' }),
      value: nextDay2ISO,
    },
  ];

  return (
    <form onSubmit={submit} noValidate className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Left column: delivery + payment */}
      <div className="lg:col-span-7 xl:col-span-8 flex flex-col gap-6 order-2 lg:order-1">
        <SignedInNotice />
        {message ? <StatusMessage title={message} tone="error" /> : null}

        {/* Delivery Details */}
        <section className="bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-[0_10px_48px_-12px_rgba(94,89,80,0.06)] p-5 md:p-7">
          <h2 className="font-display text-[22px] md:text-[24px] font-medium leading-tight text-on-surface">{t('deliveryDetails') ?? 'Delivery Details'}</h2>
          <p className="mt-2 text-[15px] leading-relaxed text-on-surface-variant max-w-[44ch]">Please provide the delivery address and preferred date for your botanical arrangement.</p>

          <div className="mt-6 grid gap-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="recipientName" className={stitchLabel}>
                  {t('recipientName')}
                </Label>
                <Input
                  id="recipientName"
                  placeholder="e.g. Nour Hassan"
                  value={input.recipientName}
                  onChange={(e) => update('recipientName', e.target.value)}
                  aria-invalid={Boolean(errors.recipientName)}
                  className={stitchInput}
                  required
                />
                {errors.recipientName ? <small className="text-sm text-destructive">{errors.recipientName}</small> : null}
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="recipientPhone" className={stitchLabel}>
                  {t('recipientPhone')}
                </Label>
                <Input
                  id="recipientPhone"
                  type="tel"
                  placeholder="+20 1XX XXX XXXX"
                  value={input.recipientPhone}
                  onChange={(e) => update('recipientPhone', e.target.value)}
                  aria-invalid={Boolean(errors.recipientPhone)}
                  className={stitchInput}
                  required
                />
                {errors.recipientPhone ? <small className="text-sm text-destructive">{errors.recipientPhone}</small> : null}
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="address" className={stitchLabel}>
                {t('address')}
              </Label>
              <Input
                id="address"
                placeholder="Street name, building number"
                value={input.address}
                onChange={(e) => update('address', e.target.value)}
                aria-invalid={Boolean(errors.address)}
                className={stitchInput}
                required
              />
              {errors.address ? <small className="text-sm text-destructive">{errors.address}</small> : null}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="senderName" className={stitchLabel}>
                  {t('yourName')}
                </Label>
                <Input
                  id="senderName"
                  placeholder={t('yourName')}
                  value={input.senderName}
                  onChange={(e) => update('senderName', e.target.value)}
                  aria-invalid={Boolean(errors.senderName)}
                  className={stitchInput}
                  required
                />
                {errors.senderName ? <small className="text-sm text-destructive">{errors.senderName}</small> : null}
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="senderEmail" className={stitchLabel}>
                  {t('yourEmail')}
                </Label>
                <Input
                  id="senderEmail"
                  type="email"
                  placeholder="amina@example.com"
                  value={input.senderEmail}
                  onChange={(e) => update('senderEmail', e.target.value)}
                  aria-invalid={Boolean(errors.senderEmail)}
                  className={stitchInput}
                  required
                />
                {errors.senderEmail ? <small className="text-sm text-destructive">{errors.senderEmail}</small> : null}
              </div>
            </div>
          </div>
        </section>

        {/* Delivery Date */}
        <section className="bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-[0_10px_48px_-12px_rgba(94,89,80,0.06)] p-5 md:p-7">
          <div className="flex items-center justify-between gap-4">
            <h2 className="font-display text-[22px] md:text-[24px] font-medium leading-tight text-on-surface">Delivery Date</h2>
            <span className="grid h-8 w-8 place-items-center rounded-full bg-surface-container text-on-surface-variant text-sm" aria-hidden>
              📅
            </span>
          </div>

          <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {deliveryDateOptions.map((opt) => {
              const active = input.deliveryDate === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => update('deliveryDate', opt.value)}
                  className={
                    active
                      ? 'relative overflow-hidden flex flex-col items-center justify-center rounded-lg border-2 border-primary bg-surface-container-low p-4 text-center transition-colors'
                      : 'flex flex-col items-center justify-center rounded-lg border border-outline-variant/50 bg-surface-container-lowest p-4 text-center hover:border-primary hover:bg-surface-container-low transition-colors'
                  }
                >
                  {active ? (
                    <>
                      <span className="absolute top-0 right-0 w-8 h-8 bg-primary rotate-45 translate-x-4 -translate-y-4" aria-hidden />
                      <span className="absolute top-1 right-1 text-[10px] leading-none text-on-primary" aria-hidden>
                        ✓
                      </span>
                    </>
                  ) : null}
                  <span className={active ? 'text-[13px] font-medium text-primary' : 'text-[13px] text-on-surface-variant'}>{opt.label}</span>
                  <span className="font-mono text-[12px] tracking-[0.05em] text-on-surface mt-0.5">{opt.sub}</span>
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => document.getElementById('deliveryDate')?.focus()}
              className={
                !deliveryDateOptions.some((o) => o.value === input.deliveryDate)
                  ? 'relative overflow-hidden flex flex-col items-center justify-center rounded-lg border-2 border-primary bg-surface-container-low p-4 text-center'
                  : 'flex flex-col items-center justify-center rounded-lg border border-dashed border-outline-variant/60 bg-surface-container-lowest p-4 text-center hover:border-primary transition-colors'
              }
            >
              <span className="text-on-surface-variant text-sm" aria-hidden>
                🗓
              </span>
              <span className="font-mono text-[12px] tracking-[0.05em] text-on-surface-variant mt-1">Custom</span>
            </button>
          </div>

          <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="deliveryDate" className={stitchLabel}>
                {t('deliveryDate')}
              </Label>
              <Input id="deliveryDate" type="date" min={minDate} value={input.deliveryDate} onChange={(e) => update('deliveryDate', e.target.value)} className={stitchInput} required />
              {errors.deliveryDate ? <small className="text-sm text-destructive">{errors.deliveryDate}</small> : null}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="deliveryWindow" className={stitchLabel}>
                {t('deliveryWindow')}
              </Label>
              <Select value={input.deliveryWindow} onValueChange={(v) => update('deliveryWindow', v)}>
                <SelectTrigger
                  id="deliveryWindow"
                  className="h-auto rounded-t-md rounded-b-none border-0 border-b border-outline-variant bg-surface-container-low px-4 py-3 text-[15px] text-on-surface focus:ring-0 focus:ring-offset-0 data-[placeholder]:text-on-surface-variant/60"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="12-3">12:00–15:00</SelectItem>
                  <SelectItem value="3-6">15:00–18:00</SelectItem>
                  <SelectItem value="6-9">18:00–21:00</SelectItem>
                </SelectContent>
              </Select>
              {errors.deliveryWindow ? <small className="text-sm text-destructive">{errors.deliveryWindow}</small> : null}
            </div>
          </div>
        </section>

        {/* Payment */}
        <section className="bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-[0_10px_48px_-12px_rgba(94,89,80,0.06)] p-5 md:p-7">
          <h2 className="font-display text-[22px] md:text-[24px] font-medium leading-tight text-on-surface">Payment Method</h2>

          <fieldset className="mt-5 grid gap-3">
            <legend className="sr-only">{t('paymentMethod')}</legend>
            <div className="grid gap-3">
              {availablePaymentMethods.map((method) => {
                const label = method === 'paymob' ? (t('paymob') as string) : method === 'pay-on-delivery' ? (t('payDelivery') as string) : (t('demoCard') as string);
                const isCard = method === 'paymob' || method === 'demo-card';
                const checked = input.paymentMethod === method;
                return (
                  <label
                    key={method}
                    className={
                      checked
                        ? 'relative flex cursor-pointer rounded-xl border-2 border-primary bg-surface-container-low p-4 transition-colors'
                        : 'relative flex cursor-pointer rounded-xl border border-outline-variant/50 bg-surface-container-lowest p-4 hover:bg-surface-container-low transition-colors'
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
                value={input.giftCardCode ?? ''}
                onChange={(e) => update('giftCardCode', e.target.value)}
                aria-label={t('giftCardCode') as string}
                className={stitchInput + ' rounded-md'}
              />
            </div>

            <label className="flex items-center gap-3 rounded-xl border border-outline-variant/40 bg-surface-container-low/60 p-4 cursor-pointer has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-ring">
              <input type="checkbox" checked={simulateFailure} onChange={(e) => setSimulateFailure(e.target.checked)} className="accent-primary h-4 w-4 rounded border-outline-variant" />
              <span className="text-sm text-on-surface">{t('simulateFailure')}</span>
            </label>

            <Button type="submit" disabled={submitting} className="w-full justify-center py-6 text-[15px] font-medium mt-2">
              {submitting ? t('processing') : t('placeOrder')} · <span className="font-mono tracking-[0.05em]">{formatMoney(displayTotal, locale)}</span> <span aria-hidden>↗</span>
            </Button>
            <p className="text-center text-xs leading-relaxed text-on-surface-variant">{t('demoDisclosure')}</p>
          </div>
        </section>
      </div>

      {/* Right: Bag summary */}
      <div className="lg:col-span-5 xl:col-span-4 order-1 lg:order-2">
        <div className="sticky top-[100px] bg-surface-container-low rounded-xl border border-outline-variant/30 shadow-[0_10px_48px_-12px_rgba(94,89,80,0.06)] p-5 md:p-6 flex flex-col gap-6">
          <h3 className="font-display text-[22px] font-medium text-on-surface border-b border-outline-variant/20 pb-4">Bag Summary</h3>

          <div className="space-y-5">
            {cart.lines.map((line) => (
              <CartLineItem key={line.id} line={line} onQuantityChange={(q) => updateQuantity(line.id, q)} onRemove={() => removeItem(line.id)} />
            ))}
          </div>

          {firstGiftLine?.message ? (
            <div className="bg-surface-bright border border-outline-variant/40 rounded-lg p-4 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-16 h-16 bg-primary-fixed/20 rounded-bl-full -mr-8 -mt-8 pointer-events-none" />
              <div className="flex items-center gap-2 mb-2">
                <span className="text-primary text-[18px] leading-none" aria-hidden>
                  ♥
                </span>
                <span className="text-[13px] font-medium text-on-surface">Gift Note Included</span>
              </div>
              <p className="font-display text-[15px] italic leading-relaxed text-on-surface-variant pl-4 border-l-2 border-outline-variant/50">“{firstGiftLine.message}”</p>
            </div>
          ) : null}

          <div className="space-y-3 text-[15px] text-on-surface-variant border-t border-outline-variant/20 pt-6">
            <div className="flex justify-between gap-4">
              <span>{t('subtotal')}</span>
              <span className="font-mono text-[14px] tracking-[0.05em] text-on-surface">{formatMoney(totals.subtotal, locale)}</span>
            </div>
            {promoDiscount ? (
              <div className="flex justify-between gap-4 text-success">
                <span>{t('discount')}</span>
                <span className="font-mono text-[14px] tracking-[0.05em]">−{formatMoney(promoDiscount, locale)}</span>
              </div>
            ) : null}
            <div className="flex justify-between gap-4">
              <span>Delivery to {cityLabel}</span>
              <span className="font-mono text-[14px] tracking-[0.05em] text-on-surface">{formatMoney(totals.deliveryFee, locale)}</span>
            </div>
            <div className="pt-4 mt-2 border-t border-outline-variant/30 flex justify-between items-end gap-4">
              <span className="text-[18px] font-medium text-on-surface">{t('total')}</span>
              <span className="font-mono text-[20px] font-bold tracking-[0.05em] text-primary">{formatMoney(displayTotal, locale)}</span>
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}
