'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useI18n } from '@/features/i18n/I18nProvider';
import { defaultDeliveryDate, minDeliveryDate } from '@/features/delivery/dates';
import { createRecipientId, type CartRecipient } from './recipient-types';
import { deferToTask } from '@/hooks/use-deferred-task';

const WINDOWS = ['9-12', '12-3', '3-6', '6-9'];
const EMPTY: Omit<CartRecipient, 'id'> = { recipientName: '', recipientPhone: '', address: '', deliveryDate: '', deliveryWindow: '12-3' };

export function RecipientEditorDialog({ value, open, onClose, onSave }: {
  value: CartRecipient | null;
  open: boolean;
  onClose: () => void;
  onSave: (recipient: CartRecipient) => void;
}) {
  const { t } = useI18n();
  const [form, setForm] = useState<Omit<CartRecipient, 'id'>>(EMPTY);
  useEffect(() => {
    if (!open) return;
    // Defer the state sync off the effect body so React's commit phase can
    // finish before we cascade another render. Bootstrap reads after mount are
    // exactly the case the React team recommends deferring.
    deferToTask(() => {
      if (value) {
        const { id: _id, ...rest } = value;
        setForm(rest);
      } else {
        const now = new Date();
        setForm({ ...EMPTY, deliveryDate: defaultDeliveryDate(now), deliveryWindow: '12-3' });
      }
    });
  }, [value, open]);

  if (!open) return null;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!form.recipientName.trim() || !form.recipientPhone.trim() || !form.address.trim() || !form.deliveryDate) return;
    onSave({ id: value?.id ?? createRecipientId(), label: form.recipientName, ...form });
  };
  const set = (k: keyof Omit<CartRecipient, 'id'>, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <form onSubmit={submit} className="grid gap-4 p-6" data-testid="recipient-editor">
      <h2 className="font-display text-lg text-on-surface">{value ? t('recipientsEdit') : t('recipientsAdd')}</h2>
      <div className="grid gap-2">
        <Label>{t('recipientsName')}</Label>
        <Input value={form.recipientName} required onChange={(e) => set('recipientName', e.target.value)} />
      </div>
      <div className="grid gap-2">
        <Label>{t('recipientsPhone')}</Label>
        <Input value={form.recipientPhone} required inputMode="tel" onChange={(e) => set('recipientPhone', e.target.value)} />
      </div>
      <div className="grid gap-2">
        <Label>{t('recipientsAddress')}</Label>
        <Input value={form.address} required onChange={(e) => set('address', e.target.value)} />
      </div>
      <div className="grid gap-2">
        <Label>{t('recipientsDate')}</Label>
        <Input type="date" value={form.deliveryDate} required min={minDeliveryDate(new Date())} onChange={(e) => set('deliveryDate', e.target.value)} />
      </div>
      <div className="grid gap-2">
        <Label>{t('recipientsWindow')}</Label>
        <Select value={form.deliveryWindow} onValueChange={(v) => set('deliveryWindow', v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{WINDOWS.map((w) => <SelectItem key={w} value={w}>{w}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="flex justify-end gap-3">
        <Button type="button" variant="ghost" onClick={onClose}>{t('cancel')}</Button>
        <Button type="submit">{t('save')}</Button>
      </div>
    </form>
  );
}