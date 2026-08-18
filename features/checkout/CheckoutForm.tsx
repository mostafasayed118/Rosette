'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { StatusMessage } from '@/components/ui/status-message';
import { readDestination } from '@/features/destination/storage';
import { calculateCartTotals } from '@/features/cart/pricing';
import { useCart } from '@/features/cart/CartProvider';
import { useDeliveryFee } from '@/features/delivery/useDeliveryFee';
import { usePromoCode } from '@/features/promo/usePromoCode';
import { estimateDeliveryFeeMinor } from '@/features/destination/delivery-fee';
import { useI18n } from '@/features/i18n/I18nProvider';
import { formatMoney } from '@/features/money';
import { createLocalOrder } from '@/features/order/repository';
import { validateCheckout } from './validation';
import type { CheckoutErrors, CheckoutInput } from './types';

const initialInput: CheckoutInput = { recipientName: '', recipientPhone: '', address: '', senderName: '', senderEmail: '', deliveryDate: '2026-08-20', deliveryWindow: '12-3', paymentMethod: 'paymob' };

const selectClass = 'h-11 w-full rounded-[10px] border border-border bg-background px-3.5 text-foreground';

type OrderApiResponse = { orderId?: string; checkoutUrl?: string | null; error?: string };

export function CheckoutForm() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const { cart, ready, clearCart } = useCart();
  const cityCode = readDestination()?.cityCode ?? 'alexandria';
  const { feeMinor } = useDeliveryFee(cityCode);
  const deliveryFee = feeMinor ?? estimateDeliveryFeeMinor(cityCode) ?? 1500;
  const liveTotal = calculateCartTotals(cart.lines, cart.lines.length ? deliveryFee : 0).total;
  const promo = usePromoCode(calculateCartTotals(cart.lines, 0).subtotal);
  const promoDiscount = promo.discountMinor ?? 0;
  const [input, setInput] = useState(initialInput);
  const [errors, setErrors] = useState<CheckoutErrors>({});
  const [simulateFailure, setSimulateFailure] = useState(false);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

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
    const destination = readDestination() ?? { countryCode: 'EG', cityCode: 'alexandria' };

    try {
      if (input.paymentMethod === 'paymob') {
        const response = await fetch('/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cart, destination, checkout: { ...input, promoCode: promo.state === 'valid' ? promo.code.trim() : undefined }, locale }) });
        const data = await response.json() as OrderApiResponse;
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

      const result = createLocalOrder({ cart, destination, recipient: { name: input.recipientName, phone: input.recipientPhone }, sender: { name: input.senderName, email: input.senderEmail }, delivery: { address: input.address, date: input.deliveryDate, window: input.deliveryWindow }, paymentMethod: input.paymentMethod, simulatePaymentFailure: simulateFailure });
      if (!result.ok) {
        setMessage(t('demoPaymentFailed'));
        return;
      }
      clearCart();
      router.push(`/orders/${result.value.id}`);
    } catch {
      setMessage(t('temporaryError'));
    } finally {
      setSubmitting(false);
    }
  }

  if (!ready) return <StatusMessage title={t('openingBag')} />;
  if (!cart.lines.length) return <StatusMessage title={t('bagWaiting')} />;

  return <form className="grid max-w-[60rem] gap-6 pt-8" onSubmit={submit} noValidate>
    {message ? <StatusMessage title={message} tone="error" /> : null}
    <section className="grid gap-4 border-b py-6"><p className="text-xs font-bold uppercase tracking-[.16em] text-sage">{t('whoFor')}</p><div className="grid grid-cols-2 gap-4 max-md:grid-cols-1"><Field id="recipientName" label={t('recipientName')} value={input.recipientName} onChange={(event) => update('recipientName', event.target.value)} error={errors.recipientName} required /><Field id="recipientPhone" label={t('recipientPhone')} type="tel" value={input.recipientPhone} onChange={(event) => update('recipientPhone', event.target.value)} error={errors.recipientPhone} required /><Field id="address" label={t('address')} className="col-span-2 max-md:col-span-1" value={input.address} onChange={(event) => update('address', event.target.value)} error={errors.address} required /></div></section>
    <section className="grid gap-4 border-b py-6"><p className="text-xs font-bold uppercase tracking-[.16em] text-sage">{t('details')}</p><div className="grid grid-cols-2 gap-4 max-md:grid-cols-1"><Field id="senderName" label={t('yourName')} value={input.senderName} onChange={(event) => update('senderName', event.target.value)} error={errors.senderName} required /><Field id="senderEmail" label={t('yourEmail')} type="email" value={input.senderEmail} onChange={(event) => update('senderEmail', event.target.value)} error={errors.senderEmail} required /><Field id="deliveryDate" label={t('deliveryDate')} type="date" min="2026-08-17" value={input.deliveryDate} onChange={(event) => update('deliveryDate', event.target.value)} error={errors.deliveryDate} required /><label className="grid gap-1.5"><span className="text-sm font-bold text-foreground">{t('deliveryWindow')}</span><select id="deliveryWindow" className={selectClass} value={input.deliveryWindow} onChange={(event) => update('deliveryWindow', event.target.value)}><option value="12-3">12:00–15:00</option><option value="3-6">15:00–18:00</option><option value="6-9">18:00–21:00</option></select>{errors.deliveryWindow ? <small className="text-sm text-destructive">{errors.deliveryWindow}</small> : null}</label></div></section>
    <section className="grid gap-4 border-b py-6"><p className="text-xs font-bold uppercase tracking-[.16em] text-sage">{t('paymentEyebrow')}</p><label className="grid gap-1.5"><span className="text-sm font-bold text-foreground">{t('paymentMethod')}</span><select className={selectClass} value={input.paymentMethod} onChange={(event) => update('paymentMethod', event.target.value as CheckoutInput['paymentMethod'])}><option value="paymob">{t('paymob')}</option><option value="pay-on-delivery">{t('payDelivery')}</option><option value="demo-card">{t('demoCard')}</option></select></label><label className="grid gap-1.5"><span className="text-sm font-bold text-foreground">{t('promoCode')}</span><div className="flex gap-2"><input type="text" value={promo.code} onChange={(event) => promo.setCode(event.target.value)} aria-label={t('promoCode')} className="h-11 flex-1 rounded-[10px] border border-border bg-background px-3.5 text-foreground" /><Button type="button" variant="outline" size="sm" onClick={promo.confirm}>{t('applyPromo')}</Button></div>{promo.state === 'valid' ? <small className="text-sm text-success">{t('promoApplied')} — {formatMoney(promo.discountMinor ?? 0, locale)}</small> : promo.error ? <small className="text-sm text-destructive">{promo.error === 'below_minimum' ? t('promoBelowMinimum') : promo.error === 'not_found' ? t('promoNotFound') : t('promoInvalid')}</small> : null}</label><label className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4"><input type="checkbox" checked={simulateFailure} onChange={(event) => setSimulateFailure(event.target.checked)} className="accent-primary" /><span>{t('simulateFailure')}</span></label><Button type="submit" disabled={submitting}>{submitting ? t('processing') : t('placeOrder')} · {formatMoney(Math.max(0, liveTotal - promoDiscount), locale)} <span aria-hidden="true">↗</span></Button><p className="text-xs text-muted-foreground">{t('demoDisclosure')}</p></section>
  </form>;
}
