'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { StatusMessage } from '@/components/ui/status-message';
import { getBrowserSupabase } from '@/lib/supabase/browser';
import { useI18n } from '@/features/i18n/I18nProvider';

export default function AccountSignupPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const supabase = getBrowserSupabase();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    setSubmitting(true);
    setError('');
    const { error: signUpError } = await supabase.auth.signUp({ email: email.trim(), password });
    if (signUpError) {
      setError(t('signUpFailed'));
      setSubmitting(false);
      return;
    }
    router.push('/account');
    router.refresh();
  }

  return (
    <main className="mx-auto w-[min(calc(100%-3rem),80rem)] py-12 pb-24 max-md:w-[min(calc(100%-2rem),80rem)] max-md:pt-4">
      <section className="mx-auto grid max-w-[34rem] gap-5 rounded-2xl border bg-card p-8 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-[.16em] text-sage">{t('account')}</p>
        <h1 className="font-display text-[clamp(2.5rem,6vw,4.5rem)] leading-[.95] tracking-[-.02em]">{t('signUp')}</h1>
        {!supabase ? (
          <StatusMessage title={t('authNotConfigured')} tone="error" />
        ) : (
          <form className="grid gap-6" onSubmit={submit} noValidate>
            {error ? <StatusMessage title={error} tone="error" /> : null}
            <Field id="email" label={t('email')} type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
            <Field id="password" label={t('password')} type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" required />
            <Button type="submit" disabled={submitting}>{submitting ? t('processing') : t('signUp')}</Button>
          </form>
        )}
        <p className="text-xs text-muted-foreground">
          <Link className="text-primary underline underline-offset-4" href="/account/login">{t('signIn')}</Link>
        </p>
      </section>
    </main>
  );
}
