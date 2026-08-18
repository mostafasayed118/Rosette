'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { StatusMessage } from '@/components/ui/status-message';
import { getBrowserSupabase } from '@/lib/supabase/browser';
import { useI18n } from '@/features/i18n/I18nProvider';

export default function ForgotPasswordPage() {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const supabase = getBrowserSupabase();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    setSubmitting(true);
    await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/account/reset-password` });
    setSent(true);
    setSubmitting(false);
  }

  return (
    <main className="mx-auto w-[min(calc(100%-3rem),80rem)] py-12 pb-24 max-md:w-[min(calc(100%-2rem),80rem)] max-md:pt-4">
      <section className="mx-auto grid max-w-[34rem] gap-5 rounded-2xl border bg-card p-8 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-[.16em] text-sage">{t('account')}</p>
        <h1 className="font-display text-[clamp(2rem,5vw,3.5rem)] leading-[.95] tracking-[-.02em]">{t('forgotPassword')}</h1>
        {!supabase ? (
          <StatusMessage title={t('authNotConfigured')} tone="error" />
        ) : sent ? (
          <StatusMessage title={t('resetEmailSent')} tone="success" />
        ) : (
          <form className="grid gap-6" onSubmit={submit} noValidate>
            <Field id="email" label={t('email')} type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
            <Button type="submit" disabled={submitting}>{submitting ? t('processing') : t('resetPassword')}</Button>
          </form>
        )}
        <p className="text-xs text-muted-foreground">
          <Link className="text-primary underline underline-offset-4" href="/account/login">{t('signIn')}</Link>
        </p>
      </section>
    </main>
  );
}
