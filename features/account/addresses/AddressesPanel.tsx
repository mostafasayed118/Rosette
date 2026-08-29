'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/features/i18n/I18nProvider';
import { removeAddress, saveAddress } from './actions';
import { AddressForm } from './AddressForm';
import type { AddressBookEntry, AddressBookInput } from './types';

type AddressesPanelProps = {
  addresses: AddressBookEntry[];
  accountPath: string;
};

export function AddressesPanel({ addresses, accountPath }: AddressesPanelProps) {
  const { t } = useI18n();
  const [editing, setEditing] = useState<AddressBookEntry | null>(null);
  const [creating, setCreating] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function handleSubmit(addressId: string | null, payload: AddressBookInput) {
    const result = await saveAddress(addressId, payload, accountPath);
    if (result === 'saved') {
      setCreating(false);
      setEditing(null);
    }
    return result;
  }

  async function handleRemove(id: string) {
    setPendingId(id);
    const result = await removeAddress(id, accountPath);
    setPendingId(null);
    if (result === 'deleted') {
      setEditing((current) => (current?.id === id ? null : current));
    }
  }

  const showForm = creating || editing !== null;

  return (
    <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:gap-16">
      <div className="grid gap-6">
        {addresses.length === 0 && !showForm ? (
          <div className="grid gap-2 rounded-2xl border border-dashed border-outline-variant/40 p-8 text-center">
            <p className="font-medium text-foreground">{t('addressesEmpty')}</p>
            <p className="text-sm text-on-surface-variant">{t('addressesEmptyHint')}</p>
          </div>
        ) : null}
        {addresses.map((row) => (
          <article
            key={row.id}
            className="grid gap-3 rounded-2xl border border-outline-variant/30 bg-surface-container p-6"
          >
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <h2 className="font-display text-lg font-semibold text-primary">{row.label}</h2>
                {row.isDefault ? (
                  <span className="rounded-full bg-primary-container px-3 py-1 text-xs font-semibold text-primary">{t('addressDefault')}</span>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" onClick={() => { setCreating(false); setEditing(row); }}>
                  {t('addressEdit')}
                </Button>
                <Button variant="ghost" disabled={pendingId === row.id} onClick={() => handleRemove(row.id)}>
                  {t('addressRemove')}
                </Button>
              </div>
            </div>
            <dl className="grid gap-1 text-sm text-on-surface-variant">
              <div>
                <dt className="sr-only">{t('addressRecipientName')}</dt>
                <dd className="font-medium text-foreground">{row.recipientName}</dd>
              </div>
              <div>
                <dt className="sr-only">{t('addressRecipientPhone')}</dt>
                <dd>{row.recipientPhone}</dd>
              </div>
              <div>
                <dt className="sr-only">{t('addressStreet')}</dt>
                <dd>{row.address}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
      <aside className="grid gap-4 self-start rounded-2xl border border-outline-variant/30 bg-surface-container p-6 lg:sticky lg:top-24">
        <h2 className="font-display text-lg font-semibold text-primary">{editing ? t('addressEdit') : t('addAddress')}</h2>
        {showForm ? (
          <AddressForm
            key={editing?.id ?? 'new'}
            initial={editing ?? undefined}
            onSubmit={handleSubmit}
            onDone={() => {
              setCreating(false);
              setEditing(null);
            }}
          />
        ) : (
          <Button onClick={() => setCreating(true)}>{t('addAddress')}</Button>
        )}
      </aside>
    </div>
  );
}
