'use client';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/features/i18n/I18nProvider';
import { formatMoney } from '@/features/money';
import type { CartRecipient } from './recipient-types';

export function RecipientGroupCard({ recipient, itemCount, subtotalMinor, onRemove, onEdit }: {
  recipient: CartRecipient | null;
  itemCount: number;
  subtotalMinor: number;
  onRemove: () => void;
  onEdit: () => void;
}) {
  const { t, locale } = useI18n();
  if (!recipient) return null;
  return (
    <div className="bg-surface-container-low rounded-xl border border-outline-variant/30 p-4" data-testid={`recipient-group-${recipient.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display text-[17px] text-on-surface">{recipient.label || recipient.recipientName}</p>
          <p className="text-xs text-on-surface-variant">{recipient.address} · {recipient.deliveryDate} · {recipient.deliveryWindow}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[12px] text-on-surface">{itemCount} {itemCount === 1 ? 'item' : 'items'}</span>
          <strong className="font-mono text-[13px] text-on-surface">{formatMoney(subtotalMinor, locale)}</strong>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onEdit}>{t('edit')}</Button>
        <Button type="button" variant="ghost" size="sm" aria-label={`${t('remove')} ${recipient.recipientName}`} onClick={onRemove}>{t('remove')}</Button>
      </div>
    </div>
  );
}