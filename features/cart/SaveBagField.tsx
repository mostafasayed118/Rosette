'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getBrowserSupabase } from '@/lib/supabase/browser';
import { useCart } from './CartProvider';
import { useI18n } from '@/features/i18n/I18nProvider';
import { useStorePath } from '@/features/i18n/use-store-path';
import { rosetteToast } from '@/lib/feedback';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function SaveBagField() {
  const { t, locale } = useI18n();
  const { city } = useStorePath();
  const { cart } = useCart();
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'invalid' | 'error'>('idle');

  async function save() {
    const trimmed = email.trim();
    if (!EMAIL_RE.test(trimmed)) {
      setState('invalid');
      // Keep inline validation only — toast would duplicate the field error
      return;
    }
    setState('saving');
    try {
      const response = await fetch('/api/cart/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed, locale, city, lines: cart.lines }),
      });
      if (response.ok) {
        setState('saved');
        rosetteToast.success(t('bagSaved'), { description: t('saveBagHint') });
      } else {
        setState('error');
        rosetteToast.error(t('toastError'), { description: t('temporaryError') });
      }
    } catch {
      setState('error');
      rosetteToast.error(t('toastError'), { description: t('temporaryError') });
    }
  }

  if (!getBrowserSupabase()) return null;
  if (state === 'saved') return <p className="text-sm text-success">{t('bagSaved')}</p>;
  return (
    <div className="grid gap-2">
      <p className="text-sm text-muted-foreground">{t('saveBagHint')}</p>
      <div className="flex gap-2">
        <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} aria-label={t('emailLabel')} placeholder={t('emailLabel')} />
        <Button type="button" variant="outline" size="sm" onClick={save} disabled={state === 'saving'}>{t('emailMeMyBag')}</Button>
      </div>
      {state === 'invalid' ? <small className="text-sm text-destructive">{t('saveBagInvalid')}</small> : state === 'error' ? <small className="text-sm text-destructive">{t('temporaryError')}</small> : null}
    </div>
  );
}
