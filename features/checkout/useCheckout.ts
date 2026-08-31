'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/features/i18n/I18nProvider';
import { useCart } from '@/features/cart/CartProvider';
import { calculateCartTotals } from '@/features/cart/pricing';
import { defaultDeliveryDate, minDeliveryDate } from '@/features/delivery/dates';
import { useDeliveryFee } from '@/features/delivery/useDeliveryFee';
import { usePromoCode } from '@/features/promo/usePromoCode';
import { estimateDeliveryFeeMinor } from '@/features/destination/delivery-fee';
import { groupLinesByRecipient } from '@/features/cart/cart-utils';
import { getCity } from '@/features/destination/data';
import { useStorePath } from '@/features/i18n/use-store-path';
import { deferToTask } from '@/hooks/use-deferred-task';
import { checkoutDeliveryFeeMinor } from './recipient-groups';
import type { CheckoutErrors, CheckoutInput } from './types';
import type { PaymentMethod } from './types';
import type { AddressBookEntry } from '@/features/account/addresses/types';

export type SavedAddress = Pick<AddressBookEntry, 'id' | 'label' | 'recipientName' | 'recipientPhone' | 'address' | 'isDefault'>;

// `focus-visible:ring-2` is load-bearing. These underline-only inputs have no other
// focus affordance, and the previous `ring-0 ring-offset-0` removed the last visible
// one, failing WCAG 2.4.7 Focus Visible. No ring-offset: Tailwind's default offset
// colour is white, which renders as a light halo on this page's warm cream surfaces.
export const stitchInput =
  'h-auto w-full rounded-t-md rounded-b-none border-0 border-b border-outline-variant bg-surface-container-low px-4 py-3 text-[15px] leading-normal text-on-surface placeholder:text-on-surface-variant/60 shadow-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring';

export const stitchLabel = 'text-[14px] font-medium text-on-surface-variant';

export function errorId(field: keyof CheckoutInput): string {
  return `${field}-error`;
}

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export type CheckoutHookOptions = {
  cityCode: string;
  availablePaymentMethods: PaymentMethod[];
  turnstileSiteKey?: string;
  savedAddresses: SavedAddress[];
};

export function useCheckout({ cityCode, availablePaymentMethods, turnstileSiteKey, savedAddresses }: CheckoutHookOptions) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const { href } = useStorePath();
  const { cart, ready, clearCart, updateQuantity, removeItem, multiRecipient, recipients, updateRecipient, removeRecipient } = useCart();
  const { feeMinor } = useDeliveryFee(cityCode);
  const deliveryFee = feeMinor ?? estimateDeliveryFeeMinor(cityCode) ?? 1500;
  const effectiveFee = multiRecipient ? checkoutDeliveryFeeMinor(deliveryFee, recipients) : deliveryFee;
  const totals = calculateCartTotals(cart.lines, cart.lines.length ? effectiveFee : 0);
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
  const [turnstileToken, setTurnstileToken] = useState('');
  const [minDate, setMinDate] = useState('');
  const [editingRecipient, setEditingRecipient] = useState<typeof recipients[number] | null>(null);
  const messageRef = useRef<HTMLDivElement>(null);
  // Captured once at mount: delivery windows are display-only constraints, and
  // a per-render `new Date()` is impure (a different value on every render).
  const [mountNow] = useState(() => new Date());
  // Date defaults are applied after hydration so server (UTC) and client
  // markup agree even when timezones straddle midnight. Deferred so the first
  // commit settles from the SSR snapshot.
  useEffect(() => {
    deferToTask(() => {
      const now = new Date();
      setMinDate(minDeliveryDate(now));
      setInput((current) => current.deliveryDate ? current : { ...current, deliveryDate: defaultDeliveryDate(now) });
    });
  }, []);

  useEffect(() => {
    if (message) messageRef.current?.focus();
  }, [message]);

  function update<K extends keyof CheckoutInput>(key: K, value: CheckoutInput[K]) {
    setInput((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  }

  function commitAndNavigate(after: () => void) {
    clearCart();
    after();
  }

  const todayISO = toISODate(mountNow);
  const tomorrowISO = toISODate(new Date(mountNow.getTime() + 86400000));
  const nextDay2ISO = toISODate(new Date(mountNow.getTime() + 86400000 * 2));
  const cityLabel = getCity(cityCode)?.name ?? cityCode;
  const firstGiftLine = cart.lines.find((l) => l.message?.trim());
  const buckets = groupLinesByRecipient(cart.lines);
  const dateLocale = locale === 'ar' ? 'ar-EG' : locale === 'fr' ? 'fr-FR' : 'en-GB';

  const deliveryDateOptions: Array<{ label: string; sub: string; value: string }> = [
    { label: t('checkoutDateToday'), sub: new Date(todayISO).toLocaleDateString(dateLocale, { month: 'short', day: 'numeric' }), value: todayISO },
    { label: t('checkoutDateTomorrow'), sub: new Date(tomorrowISO).toLocaleDateString(dateLocale, { month: 'short', day: 'numeric' }), value: tomorrowISO },
    {
      label: new Date(nextDay2ISO).toLocaleDateString(dateLocale, { weekday: 'short' }),
      sub: new Date(nextDay2ISO).toLocaleDateString(dateLocale, { month: 'short', day: 'numeric' }),
      value: nextDay2ISO,
    },
  ];

  return {
    t,
    locale,
    href,
    router,
    cart,
    ready,
    clearCart,
    updateQuantity,
    removeItem,
    multiRecipient,
    recipients,
    updateRecipient,
    removeRecipient,
    deliveryFee,
    effectiveFee,
    totals,
    subtotalOnly,
    promo,
    promoDiscount,
    displayTotal,
    input,
    setInput,
    errors,
    setErrors,
    message,
    setMessage,
    submitting,
    setSubmitting,
    simulateFailure,
    turnstileToken,
    minDate,
    editingRecipient,
    setEditingRecipient,
    messageRef,
    update,
    commitAndNavigate,
    setSimulateFailure,
    setTurnstileToken,
    turnstileSiteKey,
    availablePaymentMethods,
    savedAddresses,
    cityLabel,
    deliveryDateOptions,
    dateLocale,
    todayISO,
    tomorrowISO,
    nextDay2ISO,
    firstGiftLine,
    buckets,
  };
}
