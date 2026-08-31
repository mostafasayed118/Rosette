'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { StatusMessage } from '@/components/ui/status-message';
import { getBrowserSupabase } from '@/lib/supabase/browser';
import { useI18n } from '@/features/i18n/I18nProvider';

export default function LoginPage() {
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
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (signInError) {
      setError(t('signInFailed'));
      setSubmitting(false);
      return;
    }
    router.push('/admin');
    router.refresh();
  }

  return (
    <main id="main-content" className="mx-auto w-[min(calc(100%-3rem),80rem)] py-12 pb-24 max-md:w-[min(calc(100%-2rem),80rem)] max-md:pt-4">
      <section className="mx-auto grid max-w-[34rem] gap-5 rounded-2xl border bg-card p-8 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-[.16em] text-sage">{t('adminEyebrow')}</p>
        <h1 className="font-display text-[clamp(2.5rem,6vw,4.5rem)] leading-[.95] tracking-[-.02em]">{t('signIn')}</h1>
        {!supabase ? (
          <StatusMessage title={t('authNotConfigured')} tone="error" />
        ) : (
          <form className="grid gap-6" onSubmit={submit} noValidate>
            {error ? <StatusMessage title={error} tone="error" /> : null}
            <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
              <Field id="email" label={t('email')} type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
              <Field id="password" label={t('password')} type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required />
            </div>
            <Button type="submit" disabled={submitting}>{submitting ? t('processing') : t('signIn')}</Button>
          </form>
        )}
        <p className="text-xs text-muted-foreground"><Link className="text-primary underline underline-offset-4" href="/">{t('backCollection')}</Link></p>
      </section>
    </main>
  );
}
