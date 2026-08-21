'use client';

import { useState } from 'react';
import { useI18n } from '@/features/i18n/I18nProvider';
import { setEmailEngagementPreference } from '@/features/account/actions';
import { StatusMessage } from '@/components/ui/status-message';

type EmailPreferencesProps = { initialEnabled: boolean; loadFailed?: boolean; accountPath?: string };

export function EmailPreferences({ initialEnabled, loadFailed = false, accountPath }: EmailPreferencesProps) {
  const { t } = useI18n();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(loadFailed ? t('couldNotSaveEmailPreferences') : '');
  const [error, setError] = useState(loadFailed);

  async function toggle(nextEnabled: boolean) {
    setSaving(true);
    setMessage('');
    setError(false);
    const result = await setEmailEngagementPreference(nextEnabled, undefined, accountPath);
    if (result === 'saved') {
      setEnabled(nextEnabled);
      setMessage(t('emailPreferencesSaved'));
    } else {
      setError(true);
      setMessage(t('couldNotSaveEmailPreferences'));
    }
    setSaving(false);
  }

  return (
    <section className="grid gap-3 rounded-2xl border bg-card p-5">
      <div>
        <h2 className="font-display text-xl">{t('emailPreferences')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('engagementEmailDescription')}</p>
      </div>
      {message ? <StatusMessage title={message} tone={error ? 'error' : 'success'} /> : null}
      <label className="flex items-center gap-3 text-sm" htmlFor="email-preferences-toggle">
        <input
          id="email-preferences-toggle"
          aria-label={t('emailPreferences')}
          type="checkbox"
          checked={enabled}
          disabled={saving || loadFailed}
          onChange={(event) => { void toggle(event.target.checked); }}
        />
        <span>{t('emailPreferences')}</span>
      </label>
    </section>
  );
}
