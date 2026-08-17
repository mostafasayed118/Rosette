'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { readDestination } from '@/features/destination/storage';
import { calculateCartTotals } from '@/features/cart/pricing';
import { useCart } from '@/features/cart/CartProvider';
import { useDeliveryFee } from '@/features/delivery/useDeliveryFee';
import { estimateDeliveryFeeMinor } from '@/features/destination/delivery-fee';
import { useI18n } from '@/features/i18n/I18nProvider';
import { createLocalOrder } from '@/features/order/repository';
import { validateCheckout } from './validation';
import type { CheckoutErrors, CheckoutInput } from './types';

const initialInput: CheckoutInput = { recipientName: '', recipientPhone: '', address: '', senderName: '', senderEmail: '', deliveryDate: '2026-08-20', deliveryWindow: '12-3', paymentMethod: 'paymob' };

type OrderApiResponse = { orderId?: string; checkoutUrl?: string | null; error?: string };

export function CheckoutForm() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const { cart, ready, clearCart } = useCart();
  const cityCode = readDestination()?.cityCode ?? 'alexandria';
  const { feeMinor } = useDeliveryFee(cityCode);
  const deliveryFee = feeMinor ?? estimateDeliveryFeeMinor(cityCode) ?? 1500;
  const liveTotal = calculateCartTotals(cart.lines, cart.lines.length ? deliveryFee : 0).total;
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
        const response = await fetch('/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cart, destination, checkout: input, locale }) });
        const data = await response.json() as OrderApiResponse;
        if (!response.ok || !data.orderId) {
          setMessage(data.error ?? (locale === 'ar' ? 'تعذر إنشاء الطلب.' : 'We could not create the order.'));
          return;
        }
        if (!data.checkoutUrl) {
          setMessage(locale === 'ar' ? 'الدفع الإلكتروني غير مفعّل بعد. اختر الدفع عند التوصيل أو أضف إعدادات Paymob.' : 'Online payment is not configured yet. Choose pay on delivery or add Paymob settings.');
          return;
        }
        clearCart();
        window.location.assign(data.checkoutUrl);
        return;
      }

      const result = createLocalOrder({ cart, destination, recipient: { name: input.recipientName, phone: input.recipientPhone }, sender: { name: input.senderName, email: input.senderEmail }, delivery: { address: input.address, date: input.deliveryDate, window: input.deliveryWindow }, paymentMethod: input.paymentMethod, simulatePaymentFailure: simulateFailure });
      if (!result.ok) {
        setMessage(locale === 'ar' ? 'لم تتم عملية الدفع التجريبية. سلتك محفوظة، حاول مرة أخرى.' : 'The demo payment did not go through. Your bag is safe; try again.');
        return;
      }
      clearCart();
      router.push(`/orders/${result.value.id}`);
    } catch {
      setMessage(locale === 'ar' ? 'حدث خطأ مؤقت. حاول مرة أخرى.' : 'A temporary error occurred. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (!ready) return <div className="status-message"><strong>{t('openingBag')}</strong></div>;
  if (!cart.lines.length) return <div className="status-message"><strong>{t('bagWaiting')}</strong></div>;

  return <form className="checkout-form" onSubmit={submit} noValidate>
    {message ? <div className="status-message status-error" role="alert"><strong>{message}</strong></div> : null}
    <section className="form-section"><p className="eyebrow">{t('whoFor')}</p><div className="form-grid"><Field id="recipientName" label={t('recipientName')} value={input.recipientName} onChange={(event) => update('recipientName', event.target.value)} error={errors.recipientName} required /><Field id="recipientPhone" label={t('recipientPhone')} type="tel" value={input.recipientPhone} onChange={(event) => update('recipientPhone', event.target.value)} error={errors.recipientPhone} required /><Field id="address" label={t('address')} className="span-two" value={input.address} onChange={(event) => update('address', event.target.value)} error={errors.address} required /></div></section>
    <section className="form-section"><p className="eyebrow">{t('details')}</p><div className="form-grid"><Field id="senderName" label={t('yourName')} value={input.senderName} onChange={(event) => update('senderName', event.target.value)} error={errors.senderName} required /><Field id="senderEmail" label={t('yourEmail')} type="email" value={input.senderEmail} onChange={(event) => update('senderEmail', event.target.value)} error={errors.senderEmail} required /><Field id="deliveryDate" label={t('deliveryDate')} type="date" min="2026-08-17" value={input.deliveryDate} onChange={(event) => update('deliveryDate', event.target.value)} error={errors.deliveryDate} required /><label className="field"><span>{t('deliveryWindow')}</span><select id="deliveryWindow" value={input.deliveryWindow} onChange={(event) => update('deliveryWindow', event.target.value)}><option value="12-3">12:00–15:00</option><option value="3-6">15:00–18:00</option><option value="6-9">18:00–21:00</option></select>{errors.deliveryWindow ? <small className="field-error">{errors.deliveryWindow}</small> : null}</label></div></section>
    <section className="form-section"><p className="eyebrow">{t('paymentEyebrow')}</p><label className="field"><span>{t('paymentMethod')}</span><select value={input.paymentMethod} onChange={(event) => update('paymentMethod', event.target.value as CheckoutInput['paymentMethod'])}><option value="paymob">{t('paymob')}</option><option value="pay-on-delivery">{t('payDelivery')}</option><option value="demo-card">{t('demoCard')}</option></select></label><label className="choice"><input type="checkbox" checked={simulateFailure} onChange={(event) => setSimulateFailure(event.target.checked)} /><span>{t('simulateFailure')}</span></label><Button type="submit" disabled={submitting}>{submitting ? t('processing') : t('placeOrder')} · {new Intl.NumberFormat(locale === 'ar' ? 'ar-EG' : 'en-EG', { style: 'currency', currency: 'EGP', maximumFractionDigits: 0 }).format(liveTotal / 100)} <span aria-hidden="true">↗</span></Button><p className="demo-disclosure">{t('demoDisclosure')}</p></section>
  </form>;
}
