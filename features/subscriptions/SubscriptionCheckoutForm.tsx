'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useI18n } from '@/features/i18n/I18nProvider';
import { usePromoCode } from '@/features/promo/usePromoCode';
import { TurnstileWidget } from '@/components/security/TurnstileWidget';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatMoney } from '@/features/money';
import { validateSubscriptionCheckout } from '@/features/subscriptions/validation';
import type { Plan } from '@/features/subscriptions/types';

const WINDOWS = ['Morning', 'Afternoon', 'Evening'] as const;

export function SubscriptionCheckoutForm({ plan, cityCode, citySlug, turnstileSiteKey }: { plan: Plan; cityCode: string; citySlug: string; turnstileSiteKey?: string }) {
  const router = useRouter();
  const { t, locale } = useI18n();
  const [frequency, setFrequency] = useState(plan.frequencies[0] ?? 'weekly');
  const [bundleSize, setBundleSize] = useState(plan.bundlePrices[0]?.deliveries ?? 4);
  const [recipientSelf, setRecipientSelf] = useState(true);
  const [recipientName, setRecipientName] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryWindow, setDeliveryWindow] = useState('Morning');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [giftMessage, setGiftMessage] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const priceMinor = useMemo(() => plan.bundlePrices.find((bp) => bp.deliveries === bundleSize)?.priceMinor ?? 0, [plan.bundlePrices, bundleSize]);
  const promo = usePromoCode(priceMinor);
  const totalMinor = Math.max(0, priceMinor - (promo.state === 'valid' ? promo.discountMinor ?? 0 : 0));

  const minDate = useMemo(() => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + 1);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  }, []);

  async function submit() {
    setBusy(true);
    setError('');
    const response = await fetch('/api/subscriptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        planSlug: plan.slug, frequency, bundleSize,
        recipientName: recipientSelf ? t('subscriptionRecipientMe') : recipientName.trim(),
        recipientPhone: recipientSelf ? recipientPhone.trim() : recipientPhone.trim(),
        deliveryAddress: deliveryAddress.trim(), cityCode, deliveryWindow, deliveryDate,
        locale, giftMessage: giftMessage.trim(),
        promoCode: promo.state === 'valid' ? promo.code.trim() : undefined,
        promoDiscountMinor: promo.state === 'valid' ? promo.discountMinor ?? 0 : 0,
        turnstileToken: turnstileToken || undefined,
      }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.ok) { setError(t('subscriptionActionFailed')); setBusy(false); return; }
    if (data.checkoutUrl) { window.location.assign(data.checkoutUrl); return; }
    router.push(`/${locale}/${citySlug}/account/subscriptions/${data.subscriptionId}`);
  }

  const clientCheck = validateSubscriptionCheckout(plan, { frequency, bundleSize, recipientName: recipientSelf ? 'me' : recipientName, recipientPhone, deliveryAddress, cityCode, deliveryWindow, deliveryDate }, new Date());
  const canSubmit = !busy && clientCheck.ok && Boolean(turnstileToken || !turnstileSiteKey);

  return (
    <form className="grid gap-6" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
      <fieldset className="grid gap-2">
        <Label>{t('subscriptionFrequency')}</Label>
        <div className="flex flex-wrap gap-2">
          {plan.frequencies.map((f) => (
            <button key={f} type="button" onClick={() => setFrequency(f)} aria-pressed={frequency === f}
              className={`rounded-full px-4 py-2 text-sm transition-colors ${frequency === f ? 'bg-primary text-on-primary' : 'border border-outline-variant text-on-surface-variant hover:bg-surface-container'}`}>
              {f}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="grid gap-2">
        <Label>{t('subscriptionBundleSize')}</Label>
        <div className="flex flex-wrap gap-2">
          {plan.bundlePrices.map((bp) => (
            <button key={bp.deliveries} type="button" onClick={() => setBundleSize(bp.deliveries)} aria-pressed={bundleSize === bp.deliveries}
              className={`rounded-full px-4 py-2 text-sm transition-colors ${bundleSize === bp.deliveries ? 'bg-primary text-on-primary' : 'border border-outline-variant text-on-surface-variant hover:bg-surface-container'}`}>
              {bp.deliveries} · {formatMoney(bp.priceMinor, locale)}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="grid gap-2">
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="recipient" checked={recipientSelf} onChange={() => setRecipientSelf(true)} /> {t('subscriptionRecipientMe')}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="recipient" checked={!recipientSelf} onChange={() => setRecipientSelf(false)} /> {t('subscriptionRecipientOther')}
          </label>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="recipientName">{t('subscriptionRecipientOther')}</Label>
            <Input id="recipientName" value={recipientSelf ? '' : recipientName} disabled={recipientSelf} onChange={(e) => setRecipientName(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="recipientPhone">{t('subscriptionPhone')}</Label>
            <Input id="recipientPhone" value={recipientPhone} onChange={(e) => setRecipientPhone(e.target.value)} />
          </div>
        </div>
          <div className="grid gap-1.5">
            <Label htmlFor="deliveryAddress">{t('subscriptionAddress')}</Label>
            <Input id="deliveryAddress" value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} />
          </div>
      </fieldset>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="deliveryDate">{t('subscriptionFirstDelivery')}</Label>
          <Input id="deliveryDate" type="date" min={minDate} value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="deliveryWindow">{t('subscriptionWindow')}</Label>
          <select id="deliveryWindow" value={deliveryWindow} onChange={(e) => setDeliveryWindow(e.target.value)} className="rounded-md border border-outline-variant bg-background px-3 py-2 text-sm">
            {WINDOWS.map((w) => <option key={w} value={w}>{w}</option>)}
          </select>
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="giftMessage">{t('subscriptionGiftMessage')}</Label>
        <Input id="giftMessage" value={giftMessage} onChange={(e) => setGiftMessage(e.target.value)} />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="promoCode">{t('subscriptionPromoCode')}</Label>
        <div className="flex gap-2">
          <Input id="promoCode" value={promo.code} onChange={(e) => promo.setCode(e.target.value)} />
          <Button type="button" variant="outline" onClick={() => promo.confirm()}>{t('subscriptionApply')}</Button>
        </div>
        {promo.state === 'valid' && promo.discountMinor ? <small className="text-sm text-sage">−{formatMoney(promo.discountMinor, locale)}</small> : null}
        {promo.state === 'invalid' ? <small className="text-sm text-destructive">{promo.error}</small> : null}
      </div>

      {turnstileSiteKey ? (
        <TurnstileWidget siteKey={turnstileSiteKey} onVerify={setTurnstileToken} onExpire={() => setTurnstileToken('')} onError={() => setTurnstileToken('')} />
      ) : null}

      <div className="flex items-center justify-between border-t border-outline-variant/25 pt-4">
        <p className="font-display text-[1.25rem] font-semibold text-primary">{formatMoney(totalMinor, locale)}</p>
        <Button type="submit" disabled={!canSubmit}>{t('subscriptionConfirmPurchase')}</Button>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </form>
  );
}
