'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useI18n } from '@/features/i18n/I18nProvider';

type ChangeItem = { id: string; name: string; quantity: number; giftMessage: string };

export function ChangeRequestForm({ orderId, items }: { orderId: string; items: ChangeItem[] }) {
  const router = useRouter();
  const { t } = useI18n();
  const [deliveryDate, setDeliveryDate] = useState('');
  const [deliveryWindow, setDeliveryWindow] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [address, setAddress] = useState('');
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [giftMessages, setGiftMessages] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    const changes: Record<string, unknown> = {};
    if (deliveryDate) changes.delivery_date = deliveryDate;
    if (deliveryWindow.trim()) changes.delivery_window = deliveryWindow.trim();
    if (recipientName.trim()) changes.recipient_name = recipientName.trim();
    if (recipientPhone.trim()) changes.recipient_phone = recipientPhone.trim();
    if (address.trim()) changes.delivery_address = address.trim();
    const itemChanges = items.flatMap((item) => {
      const entry: { id: string; quantity?: number; gift_message?: string } = { id: item.id };
      const rawQuantity = quantities[item.id];
      if (rawQuantity !== undefined && rawQuantity !== '') {
        const quantity = Number(rawQuantity);
        if (quantity !== item.quantity) entry.quantity = quantity;
      }
      const message = giftMessages[item.id];
      if (message !== undefined && message !== item.giftMessage) entry.gift_message = message;
      return Object.keys(entry).length > 1 ? [entry] : [];
    });
    if (itemChanges.length) changes.items = itemChanges;
    if (Object.keys(changes).length === 0) { setError(t('requestChange')); return; }
    setBusy(true);
    setError('');
    const response = await fetch(`/api/account/orders/${orderId}/change-request`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ changes }) });
    if (!response.ok) { setError(t('couldNotRequestChange')); setBusy(false); return; }
    router.refresh();
  }

  return (
    <div className="grid gap-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="grid gap-1 text-sm"><span>{t('deliveryDate')}</span><Input type="date" value={deliveryDate} onChange={(event) => setDeliveryDate(event.target.value)} /></label>
        <label className="grid gap-1 text-sm"><span>{t('deliveryWindow')}</span><Input value={deliveryWindow} onChange={(event) => setDeliveryWindow(event.target.value)} placeholder="17:00-19:00" /></label>
        <label className="grid gap-1 text-sm"><span>{t('recipientName')}</span><Input value={recipientName} onChange={(event) => setRecipientName(event.target.value)} /></label>
        <label className="grid gap-1 text-sm"><span>{t('recipientPhone')}</span><Input value={recipientPhone} onChange={(event) => setRecipientPhone(event.target.value)} /></label>
        <label className="grid gap-1 text-sm sm:col-span-2"><span>{t('address')}</span><Input value={address} onChange={(event) => setAddress(event.target.value)} /></label>
      </div>
      {items.map((item) => (
        <div key={item.id} className="grid gap-2 rounded border p-3">
          <p className="text-sm font-medium">{item.name}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="grid gap-1 text-sm"><span>{t('quantity')}</span><Input type="number" min={1} aria-label={`${t('quantity')} ${item.name}`} defaultValue={item.quantity} onChange={(event) => setQuantities((previous) => ({ ...previous, [item.id]: event.target.value }))} /></label>
            <label className="grid gap-1 text-sm"><span>{t('giftNote')}</span><Textarea rows={2} aria-label={`${t('giftNote')} ${item.name}`} defaultValue={item.giftMessage} onChange={(event) => setGiftMessages((previous) => ({ ...previous, [item.id]: event.target.value }))} /></label>
          </div>
        </div>
      ))}
      <div className="flex items-center gap-3">
        <Button variant="outline" onClick={submit} disabled={busy}>{t('requestChange')}</Button>
        {error ? <small className="text-sm text-destructive">{error}</small> : null}
      </div>
    </div>
  );
}
