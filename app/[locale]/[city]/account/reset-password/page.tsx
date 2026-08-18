'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { StatusMessage } from '@/components/ui/status-message';
import { getBrowserSupabase } from '@/lib/supabase/browser';
import { useI18n } from '@/features/i18n/I18nProvider';
import { useStorePath } from '@/features/i18n/use-store-path';

export default function ResetPasswordPage() {
  const { t } = useI18n();
  const { href } = useStorePath();
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const supabase = getBrowserSupabase();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    setSubmitting(true);
    setError('');
    // The recovery session is established from the email link; updateUser sets the new password.
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setError(t('signInFailed'));
      setSubmitting(false);
      return;
    }
    router.push(href('/account/login'));
    router.refresh();
  }

  return (
    <main className="mx-auto w-[min(calc(100%-3rem),80rem)] py-12 pb-24 max-md:w-[min(calc(100%-2rem),80rem)] max-md:pt-4">
      <section className="mx-auto grid max-w-[34rem] gap-5 rounded-2xl border bg-card p-8 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-[.16em] text-sage">{t('account')}</p>
        <h1 className="font-display text-[clamp(2rem,5vw,3.5rem)] leading-[.95] tracking-[-.02em]">{t('resetPassword')}</h1>
        {!supabase ? (
          <StatusMessage title={t('authNotConfigured')} tone="error" />
        ) : (
          <form className="grid gap-6" onSubmit={submit} noValidate>
            {error ? <StatusMessage title={error} tone="error" /> : null}
            <Field id="password" label={t('newPassword')} type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" required />
            <Button type="submit" disabled={submitting}>{submitting ? t('processing') : t('resetPassword')}</Button>
          </form>
        )}
      </section>
    </main>
  );
}
