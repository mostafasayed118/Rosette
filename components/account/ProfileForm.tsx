'use client';

import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { StatusMessage } from '@/components/ui/status-message';
import { updateProfile } from '@/features/account/actions';
import { useI18n } from '@/features/i18n/I18nProvider';

export function ProfileForm({ initialName, initialPhone, accountPath }: { initialName: string; initialPhone: string; accountPath?: string }) {
  const { t } = useI18n();
  const [name, setName] = useState(initialName);
  const [phone, setPhone] = useState(initialPhone);
  const [message, setMessage] = useState('');
  const [tone, setTone] = useState<'error' | 'success'>('success');
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    const result = await updateProfile({ displayName: name, phone, accountPath });
    if (result === 'saved') {
      setMessage(t('profileSaved'));
      setTone('success');
    } else if (result === 'unauthenticated') {
      setMessage(t('signInFailed'));
      setTone('error');
    } else {
      setMessage(t('couldNotSaveProfile'));
      setTone('error');
    }
    setSaving(false);
  }

  return (
    <form className="grid gap-4" onSubmit={submit} noValidate>
      {message ? <StatusMessage title={message} tone={tone} /> : null}
      <Field id="name" label={t('name')} value={name} onChange={(event) => setName(event.target.value)} required />
      <Field id="phone" label={t('phone')} type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} />
      <Button type="submit" disabled={saving}>{saving ? t('processing') : t('saveProfile')}</Button>
    </form>
  );
}
