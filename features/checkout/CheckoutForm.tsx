'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StatusMessage } from '@/components/ui/status-message';
import { calculateLineTotal } from '@/features/cart/pricing';
import { RecipientEditorDialog } from '@/features/cart/RecipientEditorDialog';
import { RecipientGroupCard } from '@/features/cart/RecipientGroupCard';
import { SignedInNotice } from './SignedInNotice';
import { validateCheckout } from './validation';
import { validateRecipientGroups } from './recipient-groups';
import { createLocalOrder } from '@/features/order/local-repository';
import { useCheckout, errorId, stitchInput, stitchLabel, type SavedAddress } from './useCheckout';
import { PriceSummary } from './PriceSummary';
import { PaymentStep } from './payment-step';
import type { CheckoutInput, CheckoutErrors, PaymentMethod } from './types';
import type { FormEvent } from 'react';

const defaultPaymentMethods: PaymentMethod[] = ['paymob', 'pay-on-delivery', 'demo-card'];

type OrderApiResponse = { orderId?: string; checkoutUrl?: string | null; error?: string };

export function CheckoutForm({ cityCode, availablePaymentMethods = defaultPaymentMethods, turnstileSiteKey, savedAddresses = [] }: { cityCode: string; availablePaymentMethods?: PaymentMethod[]; turnstileSiteKey?: string; savedAddresses?: SavedAddress[] }) {
  const c = useCheckout({ cityCode, availablePaymentMethods, turnstileSiteKey, savedAddresses });
  const { t, locale, href, router, cart, ready, input, setInput, errors, simulateFailure, message, submitting, turnstileToken, minDate, editingRecipient, setEditingRecipient, messageRef, update, setSimulateFailure, setTurnstileToken, turnstileSiteKey: siteKey, promo, promoDiscount, displayTotal, totals, cityLabel, deliveryDateOptions, multiRecipient, recipients, buckets, firstGiftLine } = c;

  async function submitPaymob() {
    const destination = { countryCode: 'EG', cityCode };
    const response = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cart, destination, checkout: { ...input, promoCode: promo.state === 'valid' ? promo.code.trim() : undefined }, recipients: multiRecipient ? recipients : [], locale, turnstileToken: turnstileToken || undefined }),
    });
    const data = (await response.json()) as OrderApiResponse;
    if (!response.ok || !data.orderId) {
      c.setMessage(data.error ?? t('orderCreateFailed'));
      return;
    }
    if (!data.checkoutUrl) {
      c.setMessage(t('onlinePaymentNotConfigured'));
      return;
    }
    c.commitAndNavigate(() => window.location.assign(data.checkoutUrl!));
  }

  function submitLocal() {
    const destination = { countryCode: 'EG', cityCode };
    const primary = multiRecipient ? recipients[0] : undefined;
    const result = createLocalOrder({
      cart,
      destination,
      recipient: primary ? { name: primary.recipientName, phone: primary.recipientPhone } : { name: input.recipientName, phone: input.recipientPhone },
      sender: { name: input.senderName, email: input.senderEmail },
      delivery: primary ? { address: primary.address, date: primary.deliveryDate, window: primary.deliveryWindow } : { address: input.address, date: input.deliveryDate, window: input.deliveryWindow },
      paymentMethod: input.paymentMethod,
      simulatePaymentFailure: simulateFailure,
    });
    if (!result.ok) {
      c.setMessage(t('demoPaymentFailed'));
      return;
    }
    c.commitAndNavigate(() => router.push(href(`/orders/${result.value.id}`)));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const groupError = multiRecipient ? validateRecipientGroups(recipients, cart.lines) : null;
    if (groupError) {
      c.setMessage(t(groupError));
      return;
    }
    const nextErrors = validateCheckout(input, { multiRecipient }) as CheckoutErrors;
    c.setErrors(nextErrors);
    const firstError = Object.keys(nextErrors)[0] as keyof CheckoutInput | undefined;
    if (firstError) {
      document.getElementById(firstError)?.focus();
      return;
    }
    c.setSubmitting(true);
    c.setMessage('');
    try {
      if (input.paymentMethod === 'paymob') await submitPaymob();
      else submitLocal();
    } catch {
      c.setMessage(t('temporaryError'));
    } finally {
      c.setSubmitting(false);
    }
  }

  if (!ready) return <StatusMessage title={t('openingBag')} />;
  if (!cart.lines.length) return <StatusMessage title={t('bagWaiting')} />;

  return (
    <form onSubmit={submit} noValidate className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Left column: delivery + payment */}
      <div className="lg:col-span-7 xl:col-span-8 flex flex-col gap-6 order-2 lg:order-1">
        <SignedInNotice />
        {message ? (
          <div ref={messageRef} id="checkout-form-error" tabIndex={-1} role="alert" aria-live="assertive" className="rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <StatusMessage title={message} tone="error" />
          </div>
        ) : null}

        {/* Delivery Details */}
        <section className="bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-[0_10px_48px_-12px_rgba(94,89,80,0.06)] p-5 md:p-7">
          <h2 className="font-display text-[22px] md:text-[24px] font-medium leading-tight text-on-surface">{t('deliveryDetails')}</h2>
          <p className="mt-2 text-[15px] leading-relaxed text-on-surface-variant max-w-[44ch]">{t('checkoutDeliveryLede')}</p>

          <div className="mt-6 grid gap-5">
            {multiRecipient ? (
              <>
                <div className="space-y-3">
                  {recipients.map((recipient) => {
                    const groupLines = buckets.get(recipient.id) ?? [];
                    return (
                      <RecipientGroupCard
                        key={recipient.id}
                        recipient={recipient}
                        itemCount={groupLines.reduce((s: number, l) => s + l.quantity, 0)}
                        subtotalMinor={groupLines.reduce((s: number, l) => s + calculateLineTotal(l), 0)}
                        onEdit={() => setEditingRecipient(recipient)}
                        onRemove={() => c.removeRecipient(recipient.id)}
                      />
                    );
                  })}
                </div>
                <RecipientEditorDialog value={editingRecipient} open={Boolean(editingRecipient)} onClose={() => setEditingRecipient(null)} onSave={(r) => { c.updateRecipient(r.id, r); setEditingRecipient(null); }} />
              </>
            ) : (
              <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="recipientName" className={stitchLabel}>
                  {t('recipientName')}
                </Label>
                <Input
                  id="recipientName"
                  placeholder={t('recipientNamePlaceholder')}
                  value={input.recipientName}
                  onChange={(e) => update('recipientName', e.target.value)}
                  aria-invalid={Boolean(errors.recipientName)}
                  aria-describedby={errors.recipientName ? errorId('recipientName') : undefined}
                  className={stitchInput}
                  required
                />
                {errors.recipientName ? <small id={errorId('recipientName')} role="alert" className="text-sm text-destructive">{errors.recipientName}</small> : null}
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
                  aria-describedby={errors.recipientPhone ? errorId('recipientPhone') : undefined}
                  className={stitchInput}
                  required
                />
                {errors.recipientPhone ? <small id={errorId('recipientPhone')} role="alert" className="text-sm text-destructive">{errors.recipientPhone}</small> : null}
              </div>
            </div>

            {savedAddresses.length > 0 ? (
              <div className="grid gap-1.5">
                <Label className={stitchLabel}>{t('savedAddress')}</Label>
                <div className="flex flex-wrap gap-2">
                  {savedAddresses.map((entry) => {
                    const active = input.address === entry.address && input.recipientName === entry.recipientName && input.recipientPhone === entry.recipientPhone;
                    return (
                      <button
                        key={entry.id}
                        type="button"
                        onClick={() => {
                          setInput((current) => ({ ...current, recipientName: entry.recipientName, recipientPhone: entry.recipientPhone, address: entry.address }));
                        }}
                        aria-pressed={active}
                        className={`rounded-full border px-4 py-2 text-left text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring ${active ? 'border-primary bg-primary/10 text-primary' : 'border-outline-variant text-on-surface hover:border-primary/50'}`}
                      >
                        <span className="font-medium">{entry.label}</span>
                        <span className="block text-xs text-on-surface-variant">{entry.recipientName} · {entry.address}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <div className="grid gap-1.5">
              <Label htmlFor="address" className={stitchLabel}>
                {t('address')}
              </Label>
              <Input
                id="address"
                placeholder={t('addressPlaceholder')}
                value={input.address}
                onChange={(e) => update('address', e.target.value)}
                aria-invalid={Boolean(errors.address)}
                aria-describedby={errors.address ? errorId('address') : undefined}
                className={stitchInput}
                required
              />
              {errors.address ? <small id={errorId('address')} role="alert" className="text-sm text-destructive">{errors.address}</small> : null}
            </div>
              </>
            )}

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
                  aria-describedby={errors.senderName ? errorId('senderName') : undefined}
                  className={stitchInput}
                  required
                />
                {errors.senderName ? <small id={errorId('senderName')} role="alert" className="text-sm text-destructive">{errors.senderName}</small> : null}
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
                  aria-describedby={errors.senderEmail ? errorId('senderEmail') : undefined}
                  className={stitchInput}
                  required
                />
                {errors.senderEmail ? <small id={errorId('senderEmail')} role="alert" className="text-sm text-destructive">{errors.senderEmail}</small> : null}
              </div>
            </div>
          </div>
        </section>

        {/* Delivery Date */}
        {!multiRecipient ? (
        <section className="bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-[0_10px_48px_-12px_rgba(94,89,80,0.06)] p-5 md:p-7">
          <div className="flex items-center justify-between gap-4">
            <h2 id="delivery-date-heading" className="font-display text-[22px] md:text-[24px] font-medium leading-tight text-on-surface">{t('deliveryDate')}</h2>
            <span className="grid h-8 w-8 place-items-center rounded-full bg-surface-container text-on-surface-variant text-sm" aria-hidden>
              📅
            </span>
          </div>

          <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3" role="radiogroup" aria-labelledby="delivery-date-heading">
            {deliveryDateOptions.map((opt) => {
              const active = input.deliveryDate === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => update('deliveryDate', opt.value)}
                  className={
                    active
                      ? 'relative overflow-hidden flex flex-col items-center justify-center rounded-lg border-2 border-primary bg-surface-container-low p-4 text-center transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring'
                      : 'flex flex-col items-center justify-center rounded-lg border border-outline-variant/50 bg-surface-container-lowest p-4 text-center hover:border-primary hover:bg-surface-container-low transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring'
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
              aria-pressed={!deliveryDateOptions.some((o) => o.value === input.deliveryDate)}
              aria-controls="deliveryDate"
              aria-label={t('checkoutDateCustom')}
              onClick={() => document.getElementById('deliveryDate')?.focus()}
              className={
                !deliveryDateOptions.some((o) => o.value === input.deliveryDate)
                  ? 'relative overflow-hidden flex flex-col items-center justify-center rounded-lg border-2 border-primary bg-surface-container-low p-4 text-center'
                  : 'flex flex-col items-center justify-center rounded-lg border border-dashed border-outline-variant/60 bg-surface-container-lowest p-4 text-center hover:border-primary transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring'
              }
            >
              <span className="text-on-surface-variant text-sm" aria-hidden>
                🗓
              </span>
              <span className="font-mono text-[12px] tracking-[0.05em] text-on-surface-variant mt-1">{t('checkoutDateCustom')}</span>
            </button>
          </div>

          <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="deliveryDate" className={stitchLabel}>
                {t('deliveryDate')}
              </Label>
              <Input id="deliveryDate" type="date" min={minDate} value={input.deliveryDate} onChange={(e) => update('deliveryDate', e.target.value)} aria-invalid={Boolean(errors.deliveryDate)} aria-describedby={errors.deliveryDate ? errorId('deliveryDate') : undefined} className={stitchInput} required />
              {errors.deliveryDate ? <small id={errorId('deliveryDate')} role="alert" className="text-sm text-destructive">{errors.deliveryDate}</small> : null}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="deliveryWindow" className={stitchLabel}>
                {t('deliveryWindow')}
              </Label>
              <Select value={input.deliveryWindow} onValueChange={(v) => update('deliveryWindow', v)}>
                <SelectTrigger
                  id="deliveryWindow"
                  aria-invalid={Boolean(errors.deliveryWindow)}
                  aria-describedby={errors.deliveryWindow ? errorId('deliveryWindow') : undefined}
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
              {errors.deliveryWindow ? <small id={errorId('deliveryWindow')} role="alert" className="text-sm text-destructive">{errors.deliveryWindow}</small> : null}
            </div>
          </div>
        </section>
        ) : null}

        <PaymentStep
          t={t}
          locale={locale}
          availablePaymentMethods={c.availablePaymentMethods}
          paymentMethod={input.paymentMethod}
          update={update}
          promo={promo}
          giftCardCode={input.giftCardCode}
          simulateFailure={simulateFailure}
          setSimulateFailure={setSimulateFailure}
          turnstileSiteKey={siteKey}
          setTurnstileToken={setTurnstileToken}
        />
      </div>

      <PriceSummary
        lines={cart.lines}
        onQuantityChange={c.updateQuantity}
        onRemove={c.removeItem}
        t={t}
        locale={locale}
        subtotal={totals.subtotal}
        deliveryFee={totals.deliveryFee}
        promoDiscount={promoDiscount}
        displayTotal={displayTotal}
        cityLabel={cityLabel}
        submitting={submitting}
        backHref={href('/cart')}
        giftMessage={firstGiftLine?.message}
      />
    </form>
  );
}
