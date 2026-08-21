'use client';

import { useState, type FormEvent } from 'react';
import { Gift, Infinity as InfinityIcon, Pencil, Store } from 'lucide-react';
import { useI18n } from '@/features/i18n/I18nProvider';
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
      const response = await fetch('/api/gift-cards/purchases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locale,
          cityCode,
          purchase: { mode, amountMinor, senderName, senderEmail, recipientName, recipientEmail, message, locale },
        }),
      });
      const data = (await response.json()) as { checkoutUrl?: string; error?: string };
      if (!response.ok || !data.checkoutUrl) {
        setError(data.error ?? t('giftCardPurchaseFailed'));
        return;
      }
      window.location.assign(data.checkoutUrl);
    } catch {
      setError(t('temporaryError'));
    } finally {
      setSubmitting(false);
    }
  }

  const previewRecipient = recipientName.trim() || '—';
  const previewSender = senderName.trim() || '—';
  const previewMessage = message.trim() || 'أطيب التمنيات بيوم جميل يليق بك.';
  const previewAmount = formatMoney(amountMinor, locale);

  return (
    <div className="max-w-[1280px] mx-auto px-5 md:px-[64px] grid grid-cols-1 lg:grid-cols-12 gap-16 lg:gap-[64px] items-start w-full">
      {/* Left Column: Live Preview */}
      <section className="lg:col-span-5 lg:sticky lg:top-[100px] order-2 lg:order-1 flex justify-center lg:justify-start">
        <div className="w-full max-w-[400px] lg:max-w-full aspect-[4/5] bg-primary text-on-primary rounded-xl p-8 flex flex-col justify-between shadow-[0_24px_48px_-12px_rgba(119,113,104,0.08)] relative overflow-hidden transition-all duration-500 hover:shadow-[0_32px_64px_-16px_rgba(162,44,85,0.2)]">
          {/* Decorative blobs */}
          <div className="absolute -top-24 -right-24 w-64 h-64 bg-primary-fixed-dim/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-12 -left-12 w-48 h-48 bg-surface-tint/20 rounded-full blur-2xl pointer-events-none" />
          {/* Top */}
          <div className="flex justify-between items-start relative z-10">
            <span className="font-headline-lg text-headline-lg tracking-tight">Rosette</span>
            <Gift className="h-6 w-6 opacity-70" strokeWidth={1.5} />
          </div>
          {/* Middle: Recipient & Message */}
          <div className="flex-grow flex flex-col justify-center py-4 relative z-10 gap-4">
            <div>
              <span className="block text-primary-fixed-dim font-meta-mono text-[11px] uppercase tracking-wider mb-1">Especially For</span>
              <span className="font-headline-sm text-headline-sm block truncate" id="preview-name">
                {previewRecipient}
              </span>
            </div>
            <div className="mt-4 flex-grow relative">
              <p className="font-arabic-body text-arabic-body opacity-90 break-words line-clamp-4" id="preview-message">
                {previewMessage}
              </p>
            </div>
          </div>
          {/* Bottom: Amount & Sender */}
          <div className="flex justify-between items-end border-t border-primary-fixed-dim/30 pt-4 relative z-10">
            <div>
              <span className="block text-primary-fixed-dim font-meta-mono text-[11px] uppercase tracking-wider mb-1">From</span>
              <span className="font-body-md text-body-md block truncate max-w-[120px]" id="preview-sender">
                {previewSender}
              </span>
            </div>
            <div className="text-right">
              <span className="block text-primary-fixed-dim font-meta-mono text-[11px] uppercase tracking-wider mb-1">Value</span>
              <span className="font-meta-mono text-meta-mono block" id="preview-amount">
                {previewAmount}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Right Column: Form Area */}
      <section className="lg:col-span-7 lg:pl-8 order-1 lg:order-2 flex flex-col justify-center min-h-[716px]">
        <div className="mb-8">
          <p className="font-meta-mono text-meta-mono uppercase text-on-surface-variant mb-4">{t('giftCardsEyebrow')}</p>
          <h1 className="font-display-xl-mobile md:font-display-xl text-display-xl-mobile md:text-display-xl text-on-surface tracking-tight">
            {t('giftCardsTitle')}
          </h1>
          <p className="font-body-lg text-body-lg text-on-surface-variant max-w-md mt-4">{t('giftCardsLede')}</p>
        </div>

        <form className="space-y-16" onSubmit={submit} noValidate>
          {error ? <StatusMessage title={error} tone="error" /> : null}

          {/* Amount Selection */}
          <div>
            <fieldset>
              <legend className="font-meta-mono text-meta-mono uppercase text-on-surface-variant mb-4">
                {t('giftCardAmount')}
              </legend>
              <div className="flex overflow-x-auto hide-scrollbar gap-2 pb-2 -mx-5 px-5 md:mx-0 md:px-0 md:flex-wrap">
                {FIXED_GIFT_CARD_AMOUNTS.map((value) => (
                  <label key={value} className="cursor-pointer flex-shrink-0">
                    <input
                      className="peer sr-only"
                      name="giftCardAmount"
                      type="radio"
                      checked={mode === 'fixed' && amountMinor === value}
                      onChange={() => {
                        setMode('fixed');
                        setAmountMinor(value);
                      }}
                    />
                    <div className="px-6 py-3 rounded-full border border-outline-variant bg-surface-container-low text-on-surface font-meta-mono text-meta-mono peer-checked:bg-primary peer-checked:border-primary peer-checked:text-on-primary hover:bg-surface-variant transition-colors duration-200">
                      {formatMoney(value, locale)}
                    </div>
                  </label>
                ))}
                <label className="cursor-pointer flex-shrink-0 relative rounded-full focus-within:outline-none focus-within:ring-2 focus-within:ring-secondary-container focus-within:ring-offset-2 focus-within:ring-offset-surface">
                  <input
                    className="peer sr-only"
                    name="giftCardAmount"
                    type="radio"
                    checked={mode === 'custom'}
                    onChange={() => {
                      setMode('custom');
                      setAmountMinor(MIN_CUSTOM_GIFT_CARD_MINOR);
                    }}
                  />
                  <div className="px-6 py-3 rounded-full border border-outline-variant bg-surface-container-low text-on-surface font-meta-mono text-meta-mono peer-checked:bg-primary peer-checked:border-primary peer-checked:text-on-primary transition-colors duration-200 flex items-center gap-2">
                    <Pencil className="h-[18px] w-[18px]" strokeWidth={1.5} />
                    {t('giftCardCustom')}
                  </div>
                </label>
              </div>
              {mode === 'custom' ? (
                <div className="mt-4 transition-all duration-300">
                  <div className="relative border-b border-outline-variant group focus-within:border-primary">
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 font-meta-mono text-meta-mono text-on-surface-variant">EGP</span>
                    <input
                      aria-label={t('giftCardCustomAmount')}
                      className="w-full bg-transparent border-none py-3 pl-12 pr-4 font-meta-mono text-meta-mono text-on-surface placeholder:text-outline focus:ring-0 focus:outline-none"
                      type="number"
                      min={MIN_CUSTOM_GIFT_CARD_MINOR / 100}
                      max={MAX_CUSTOM_GIFT_CARD_MINOR / 100}
                      step="0.01"
                      value={(amountMinor / 100).toFixed(2)}
                      onChange={(event) => setAmountMinor(Math.round(Number(event.target.value) * 100) || 0)}
                    />
                  </div>
                </div>
              ) : null}
            </fieldset>
          </div>

          {/* Details Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 gap-x-6">
            {/* Sender Name */}
            <div className="border-b border-outline-variant group relative transition-colors duration-300 focus-within:border-primary">
              <label className="block font-meta-mono text-[11px] uppercase tracking-wider text-on-surface-variant mb-1" htmlFor="giftCardSenderName">
                {t('giftCardSenderName')}
              </label>
              <input
                className="w-full bg-transparent border-none py-2 px-0 font-body-lg text-body-lg text-on-surface placeholder:text-outline focus:ring-0 focus:outline-none"
                id="giftCardSenderName"
                type="text"
                autoComplete="name"
                value={senderName}
                onChange={(event) => setSenderName(event.target.value)}
                required
              />
            </div>
            {/* Sender Email */}
            <div className="border-b border-outline-variant group relative transition-colors duration-300 focus-within:border-primary">
              <label className="block font-meta-mono text-[11px] uppercase tracking-wider text-on-surface-variant mb-1" htmlFor="giftCardSenderEmail">
                {t('giftCardSenderEmail')}
              </label>
              <input
                className="w-full bg-transparent border-none py-2 px-0 font-body-lg text-body-lg text-on-surface placeholder:text-outline focus:ring-0 focus:outline-none"
                id="giftCardSenderEmail"
                type="email"
                autoComplete="email"
                value={senderEmail}
                onChange={(event) => setSenderEmail(event.target.value)}
                required
              />
            </div>
            {/* Recipient Name */}
            <div className="border-b border-outline-variant group relative transition-colors duration-300 focus-within:border-primary">
              <label className="block font-meta-mono text-[11px] uppercase tracking-wider text-on-surface-variant mb-1" htmlFor="giftCardRecipientName">
                {t('giftCardRecipientName')}
              </label>
              <input
                className="w-full bg-transparent border-none py-2 px-0 font-body-lg text-body-lg text-on-surface placeholder:text-outline focus:ring-0 focus:outline-none"
                id="giftCardRecipientName"
                type="text"
                value={recipientName}
                onChange={(event) => setRecipientName(event.target.value)}
                required
              />
            </div>
            {/* Recipient Email */}
            <div className="border-b border-outline-variant group relative transition-colors duration-300 focus-within:border-primary">
              <label className="block font-meta-mono text-[11px] uppercase tracking-wider text-on-surface-variant mb-1" htmlFor="giftCardRecipientEmail">
                {t('giftCardRecipientEmail')}
              </label>
              <input
                className="w-full bg-transparent border-none py-2 px-0 font-body-lg text-body-lg text-on-surface placeholder:text-outline focus:ring-0 focus:outline-none"
                id="giftCardRecipientEmail"
                type="email"
                value={recipientEmail}
                onChange={(event) => setRecipientEmail(event.target.value)}
                required
              />
            </div>
            {/* Message */}
            <div className="border-b border-outline-variant group relative transition-colors duration-300 focus-within:border-primary md:col-span-2">
              <label className="flex justify-between font-meta-mono text-[11px] uppercase tracking-wider text-on-surface-variant mb-1" htmlFor="giftCardMessage">
                <span>{t('giftCardMessage')}</span>
                <span className="lowercase font-meta-mono text-[11px] opacity-70">Arabic Supported</span>
              </label>
              <textarea
                className="w-full bg-transparent border-none py-2 px-0 font-arabic-body text-arabic-body text-on-surface placeholder:text-outline focus:ring-0 focus:outline-none resize-none"
                id="giftCardMessage"
                rows={3}
                maxLength={500}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
              />
            </div>
          </div>

          {/* Actions & Trust */}
          <div className="pt-4 flex flex-col gap-4 items-center">
            <button
              className="w-full bg-primary text-on-primary py-4 px-8 rounded-sm font-body-lg text-body-lg text-center hover:bg-surface-tint hover:scale-[0.98] active:scale-[0.95] transition-all duration-200 shadow-[0_24px_48px_-12px_rgba(119,113,104,0.08)] disabled:opacity-50 disabled:pointer-events-none"
              type="submit"
              disabled={submitting}
            >
              {submitting ? t('processing') : t('buyGiftCard')} · {formatMoney(amountMinor, locale)}
            </button>
            <div className="flex items-center justify-center gap-6 w-full mt-4 border-t border-outline-variant/30 pt-4">
              <div className="flex items-center gap-2 text-on-surface-variant font-meta-mono text-[12px] leading-none">
                <InfinityIcon className="h-4 w-4" strokeWidth={1.5} />
                Never expires
              </div>
              <div className="flex items-center gap-2 text-on-surface-variant font-meta-mono text-[12px] leading-none">
                <Store className="h-4 w-4" strokeWidth={1.5} />
                Redeemable sitewide
              </div>
            </div>
          </div>
        </form>
      </section>
    </div>
  );
}
