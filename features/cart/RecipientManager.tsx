'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/features/i18n/I18nProvider';
import { useCart } from './CartProvider';
import { groupLinesByRecipient, UNASSIGNED_KEY } from './cart-utils';
import { calculateLineTotal } from './pricing';
import { RecipientEditorDialog } from './RecipientEditorDialog';
import { RecipientGroupCard } from './RecipientGroupCard';
import type { CartLine, CartRecipient } from './types';

export function RecipientManager() {
  const { t } = useI18n();
  const { cart, recipients, addRecipient, updateRecipient, removeRecipient, assignLineToRecipient } = useCart();
  const [editing, setEditing] = useState<CartRecipient | null>(null);
  const [adding, setAdding] = useState(false);
  const buckets = groupLinesByRecipient(cart.lines);
  const unassigned = buckets.get(UNASSIGNED_KEY) ?? [];

  return (
    <div className="space-y-4">
      {recipients.map((recipient) => {
        const lines = buckets.get(recipient.id) ?? [];
        return (
          <RecipientGroupCard
            key={recipient.id}
            recipient={recipient}
            itemCount={lines.reduce((s, l) => s + l.quantity, 0)}
            subtotalMinor={lines.reduce((s, l) => s + calculateLineTotal(l), 0)}
            onEdit={() => setEditing(recipient)}
            onRemove={() => removeRecipient(recipient.id)}
          />
        );
      })}

      {unassigned.length ? (
        <div className="rounded-xl border border-dashed border-outline-variant/50 p-4">
          <p className="mb-2 text-sm font-medium text-on-surface">{t('recipientsUnassigned')}</p>
          {unassigned.map((line) => (
            <div key={line.id} className="flex items-center justify-between gap-3 py-1 text-sm">
              <span className="truncate text-on-surface-variant">{line.productName} × {line.quantity}</span>
              <select
                aria-label={t('recipientsMoveTo')}
                value=""
                onChange={(e) => assignLineToRecipient(line.id, e.target.value || undefined)}
                className="rounded border border-outline-variant/40 bg-surface-container-low px-2 py-1 text-xs"
              >
                <option value="">{t('recipientsAssign')}</option>
                {recipients.map((r) => <option key={r.id} value={r.id}>{r.label || r.recipientName}</option>)}
              </select>
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex justify-end">
        <Button type="button" variant="outline" onClick={() => setAdding(true)}>{t('recipientsAdd')}</Button>
      </div>

      <RecipientEditorDialog value={adding ? null : editing} open={adding || Boolean(editing)} onClose={() => { setAdding(false); setEditing(null); }} onSave={(r) => { if (adding) addRecipient(r); else updateRecipient(r.id, r); setAdding(false); setEditing(null); }} />
    </div>
  );
}