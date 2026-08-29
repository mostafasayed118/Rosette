'use client';

import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusMessage } from '@/components/ui/status-message';
import { useI18n } from '@/features/i18n/I18nProvider';
import { cities } from '@/features/destination/data';
import type { AddressBookEntry, AddressBookInput, AddressBookResult } from './types';

export function AddressForm({
  initial,
  onSubmit,
  onDone,
}: {
  initial?: AddressBookEntry;
  onSubmit: (addressId: string | null, payload: AddressBookInput) => Promise<AddressBookResult>;
  onDone: () => void;
}) {
  const { t, locale } = useI18n();
  const [label, setLabel] = useState(initial?.label ?? '');
  const [recipientName, setRecipientName] = useState(initial?.recipientName ?? '');
  const [recipientPhone, setRecipientPhone] = useState(initial?.recipientPhone ?? '');
  const [address, setAddress] = useState(initial?.address ?? '');
  const [citySlug, setCitySlug] = useState(initial?.citySlug ?? cities[0]?.slug ?? 'cairo');
  const [isDefault, setIsDefault] = useState(initial?.isDefault ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(false);
    setMessage(null);
    const payload: AddressBookInput = {
      label,
      recipientName,
      recipientPhone,
      address,
      citySlug,
      isDefault,
    };
    const result = await onSubmit(initial?.id ?? null, payload);
    setBusy(false);
    if (result === 'saved') {
      onDone();
      return;
    }
    setError(true);
    setMessage(t('addressInvalid'));
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2 text-sm font-medium text-on-surface-variant">
          {t('addressLabel')}
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t('addressLabelPlaceholder')} required maxLength={50} />
        </label>
        <label className="grid gap-2 text-sm font-medium text-on-surface-variant">
          {t('addressRecipientName')}
          <Input value={recipientName} onChange={(e) => setRecipientName(e.target.value)} required maxLength={80} />
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2 text-sm font-medium text-on-surface-variant">
          {t('addressRecipientPhone')}
          <Input value={recipientPhone} onChange={(e) => setRecipientPhone(e.target.value)} required maxLength={50} />
        </label>
        <label className="grid gap-2 text-sm font-medium text-on-surface-variant">
          {locale === 'ar' ? 'المدينة' : locale === 'fr' ? 'Ville' : 'City'}
          <select
            value={citySlug}
            onChange={(e) => setCitySlug(e.target.value)}
            className="h-10 rounded-full border border-outline-variant bg-transparent px-4 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            {cities.map((city) => (
              <option key={city.slug} value={city.slug}>
                {locale === 'ar' ? city.nameAr : locale === 'fr' ? city.nameFr : city.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="grid gap-2 text-sm font-medium text-on-surface-variant">
        {t('addressStreet')}
        <textarea
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          required
          maxLength={300}
          rows={3}
          className="rounded-2xl border border-outline-variant bg-transparent px-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
      </label>
      <label className="flex items-center gap-3 text-sm font-medium text-on-surface-variant">
        <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} className="h-4 w-4 accent-primary" />
        {t('addressIsDefault')}
      </label>
      {message ? <StatusMessage title={message} tone={error ? 'error' : 'success'} /> : null}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={busy}>
          {initial ? t('addressEdit') : t('addAddress')}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone} disabled={busy}>
          {t('cancel')}
        </Button>
      </div>
    </form>
  );
}
