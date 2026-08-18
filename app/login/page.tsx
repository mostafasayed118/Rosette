'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
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
    <main className="content-frame">
      <section className="auth-card">
        <p className="eyebrow">Rosette operations</p>
        <h1>{t('signIn')}</h1>
        {!supabase ? (
          <div className="status-message status-error" role="alert">
            <strong>{t('authNotConfigured')}</strong>
          </div>
        ) : (
          <form className="checkout-form" onSubmit={submit} noValidate>
            {error ? <div className="status-message status-error" role="alert"><strong>{error}</strong></div> : null}
            <div className="form-grid">
              <Field id="email" label={t('email')} type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
              <Field id="password" label={t('password')} type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required />
            </div>
            <Button type="submit" disabled={submitting}>{submitting ? t('processing') : t('signIn')}</Button>
          </form>
        )}
        <p className="demo-disclosure"><Link href="/">{t('backCollection')}</Link></p>
      </section>
    </main>
  );
}