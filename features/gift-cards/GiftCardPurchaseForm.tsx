'use client';

import { useState, type FormEvent } from 'react';
import { useI18n } from '@/features/i18n/I18nProvider';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { StatusMessage } from '@/components/ui/status-message';
import { FIXED_GIFT_CARD_AMOUNTS, MIN_CUSTOM_GIFT_CARD_MINOR, MAX_CUSTOM_GIFT_CARD_MINOR } from './validation';
import type { GiftCardAmountMode } from './types';
import { formatMoney } from '@/features/money';

export function GiftCardPurchaseForm({ cityCode }: { cityCode: string }) {
  const { t, locale } = useI18n();
  const [mode, setMode] = useState<GiftCardAmountMode>('fixed');
  const [amountMinor, setAmountMinor] = useState<number>(FIXED_GIFT_CARD_AMOUNTS[0]);
  const [senderName, setSenderName] = useState('');
  const [senderEmail, setSenderEmail] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const response = await fetch('/api/gift-cards/purchases', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ locale, cityCode, purchase: { mode, amountMinor, senderName, senderEmail, recipientName, recipientEmail, message, locale } }) });
      const data = await response.json() as { checkoutUrl?: string; error?: string };
      if (!response.ok || !data.checkoutUrl) { setError(data.error ?? t('giftCardPurchaseFailed')); return; }
      window.location.assign(data.checkoutUrl);
    } catch { setError(t('temporaryError')); }
    finally { setSubmitting(false); }
  }

  return <form className="grid max-w-[54rem] gap-5" onSubmit={submit} noValidate>
    {error ? <StatusMessage title={error} tone="error" /> : null}
    <fieldset className="grid gap-3"><legend className="text-sm font-bold">{t('giftCardAmount')}</legend><div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{FIXED_GIFT_CARD_AMOUNTS.map((value) => <label key={value} className="flex cursor-pointer items-center gap-2 rounded-xl border p-3"><input type="radio" name="giftCardAmount" checked={mode === 'fixed' && amountMinor === value} onChange={() => { setMode('fixed'); setAmountMinor(value); }} />{formatMoney(value, locale)}</label>)}<label className="flex cursor-pointer items-center gap-2 rounded-xl border p-3"><input type="radio" name="giftCardAmount" checked={mode === 'custom'} onChange={() => { setMode('custom'); setAmountMinor(MIN_CUSTOM_GIFT_CARD_MINOR); }} />{t('giftCardCustom')}</label></div>{mode === 'custom' ? <Input aria-label={t('giftCardCustomAmount')} type="number" min={MIN_CUSTOM_GIFT_CARD_MINOR / 100} max={MAX_CUSTOM_GIFT_CARD_MINOR / 100} step="0.01" value={(amountMinor / 100).toFixed(2)} onChange={(event) => setAmountMinor(Math.round(Number(event.target.value) * 100))} /> : null}</fieldset>
    <div className="grid gap-4 sm:grid-cols-2"><Field id="giftCardSenderName" label={t('giftCardSenderName')} value={senderName} onChange={(event) => setSenderName(event.target.value)} required /><Field id="giftCardSenderEmail" label={t('giftCardSenderEmail')} type="email" value={senderEmail} onChange={(event) => setSenderEmail(event.target.value)} required /><Field id="giftCardRecipientName" label={t('giftCardRecipientName')} value={recipientName} onChange={(event) => setRecipientName(event.target.value)} required /><Field id="giftCardRecipientEmail" label={t('giftCardRecipientEmail')} type="email" value={recipientEmail} onChange={(event) => setRecipientEmail(event.target.value)} required /></div>
    <label className="grid gap-1.5"><span className="text-sm font-bold">{t('giftCardMessage')}</span><textarea className="min-h-28 rounded-xl border bg-background p-3" maxLength={500} value={message} onChange={(event) => setMessage(event.target.value)} /></label>
    <Button type="submit" disabled={submitting}>{submitting ? t('processing') : t('buyGiftCard')} · {formatMoney(amountMinor, locale)}</Button>
  </form>;
}
