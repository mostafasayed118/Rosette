'use client';

import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/features/i18n/I18nProvider';
import { FIXED_GIFT_CARD_AMOUNTS, MIN_CUSTOM_GIFT_CARD_MINOR, MAX_CUSTOM_GIFT_CARD_MINOR } from './validation';
import type { GiftCardAmountMode } from './types';

export function AdminGiftCardForm() {
  const { t, locale } = useI18n();
  const [mode, setMode] = useState<GiftCardAmountMode>('fixed');
  const [amountMinor, setAmountMinor] = useState<number>(FIXED_GIFT_CARD_AMOUNTS[0]);
  const [recipientEmail, setRecipientEmail] = useState('');
  const [senderEmail, setSenderEmail] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [senderName, setSenderName] = useState('Rosette');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    const response = await fetch('/api/admin/gift-cards', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'issue', input: { mode, amountMinor, senderName, senderEmail, recipientName, recipientEmail, message, locale: locale === 'ar' || locale === 'fr' ? locale : 'en' } }) });
    if (!response.ok) setError(t('giftCardAdminFailed'));
    else { setRecipientEmail(''); setRecipientName(''); setMessage(''); }
    setSaving(false);
  }

  return <form className="grid gap-4" onSubmit={submit} noValidate>
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{FIXED_GIFT_CARD_AMOUNTS.map((value) => <label key={value} className="flex items-center gap-2 rounded-xl border p-3"><input type="radio" name="adminGiftCardAmount" checked={mode === 'fixed' && amountMinor === value} onChange={() => { setMode('fixed'); setAmountMinor(value); }} />{value / 100} EGP</label>)}<label className="flex items-center gap-2 rounded-xl border p-3"><input type="radio" name="adminGiftCardAmount" checked={mode === 'custom'} onChange={() => setMode('custom')} />{t('giftCardCustom')}</label></div>
    {mode === 'custom' ? <Input aria-label={t('giftCardCustomAmount')} type="number" min={MIN_CUSTOM_GIFT_CARD_MINOR / 100} max={MAX_CUSTOM_GIFT_CARD_MINOR / 100} step="0.01" value={(amountMinor / 100).toFixed(2)} onChange={(event) => setAmountMinor(Math.round(Number(event.target.value) * 100))} /> : null}
    <div className="grid gap-4 sm:grid-cols-2"><Field id="adminGiftCardSenderName" label={t('giftCardSenderName')} value={senderName} onChange={(event) => setSenderName(event.target.value)} required /><Field id="adminGiftCardSenderEmail" label={t('giftCardSenderEmail')} type="email" value={senderEmail} onChange={(event) => setSenderEmail(event.target.value)} /><Field id="adminGiftCardRecipientName" label={t('giftCardRecipientName')} value={recipientName} onChange={(event) => setRecipientName(event.target.value)} required /><Field id="adminGiftCardRecipientEmail" label={t('giftCardRecipientEmail')} type="email" value={recipientEmail} onChange={(event) => setRecipientEmail(event.target.value)} required /></div>
    <label className="grid gap-1.5"><span className="text-sm font-bold">{t('giftCardMessage')}</span><textarea className="min-h-24 rounded-xl border bg-background p-3" maxLength={500} value={message} onChange={(event) => setMessage(event.target.value)} /></label>
    {error ? <small className="text-sm text-destructive">{error}</small> : null}
    <Button type="submit" disabled={saving}>{saving ? t('saving') : t('issueGiftCard')}</Button>
  </form>;
}
