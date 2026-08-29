'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Lock } from 'lucide-react';
import { useI18n } from '@/features/i18n/I18nProvider';
import { deferToTask } from '@/hooks/use-deferred-task';
import { setEmailEngagementPreference } from '@/features/account/actions';

type EmailPreferencesProps = { initialEnabled: boolean; loadFailed?: boolean; accountPath?: string };

function Toggle({
  checked,
  disabled,
  ariaLabel,
  onChange,
  id,
}: {
  checked: boolean;
  disabled?: boolean;
  ariaLabel?: string;
  onChange?: (next: boolean) => void;
  id?: string;
}) {
  return (
    <label
      className={`relative inline-flex h-6 w-12 shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-colors ${disabled ? 'cursor-not-allowed opacity-50' : ''} ${checked ? 'bg-primary' : 'bg-surface-variant'}`}
      htmlFor={id}
    >
      <input
        id={id}
        aria-label={ariaLabel}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.checked)}
        className="peer sr-only"
      />
      <span
        className={`absolute left-[2px] h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${checked ? 'translate-x-6' : 'translate-x-0'}`}
      />
    </label>
  );
}

export function EmailPreferences({ initialEnabled, loadFailed = false, accountPath }: EmailPreferencesProps) {
  const { t, locale, setLocale } = useI18n();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(loadFailed ? t('couldNotSaveEmailPreferences') : '');
  const [error, setError] = useState(loadFailed);
  const [lang, setLang] = useState(locale);

  // Derived child toggles: when master off, all off except locked order updates stays on disabled
  const [bag, setBag] = useState(initialEnabled);
  const [wishlistDrop, setWishlistDrop] = useState(initialEnabled);
  const [backInStock, setBackInStock] = useState(initialEnabled);
  const [seasonal, setSeasonal] = useState(false);

  // Mirror prop/context changes during render using the previous-value pattern:
  // no effect, no intermediate paint, and no setState-in-effect cascade.
  const [prevLocale, setPrevLocale] = useState(locale);
  if (prevLocale !== locale) { setPrevLocale(locale); setLang(locale); }
  const [prevInitialEnabled, setPrevInitialEnabled] = useState(initialEnabled);
  if (prevInitialEnabled !== initialEnabled) {
    setPrevInitialEnabled(initialEnabled);
    setEnabled(initialEnabled);
    setBag(initialEnabled);
    setWishlistDrop(initialEnabled);
    setBackInStock(initialEnabled);
  }

  useEffect(() => {
    // Flipping the master switch fans out into three child toggles; deferring
    // keeps that fan-out out of the commit phase.
    deferToTask(() => {
      setBag(enabled);
      setWishlistDrop(enabled);
      setBackInStock(enabled);
    });
  }, [enabled]);

  async function toggle(nextEnabled: boolean) {
    setSaving(true);
    setMessage('');
    setError(false);
    const result = await setEmailEngagementPreference(nextEnabled, accountPath);
    if (result === 'saved') {
      setEnabled(nextEnabled);
      setMessage(t('emailPreferencesSaved'));
    } else {
      setError(true);
      setMessage(t('couldNotSaveEmailPreferences'));
    }
    setSaving(false);
  }

  async function handleSave() {
    setSaving(true);
    setMessage('');
    setError(false);
    const result = await setEmailEngagementPreference(enabled, accountPath);
    if (result === 'saved') {
      setMessage(t('emailPreferencesSaved'));
    } else {
      setError(true);
      setMessage(t('couldNotSaveEmailPreferences'));
    }
    setSaving(false);
  }

  function handleLanguageChange(next: 'en' | 'ar' | 'fr') {
    setLang(next as never);
    setLocale(next as never);
  }

  return (
    <section className="flex max-w-3xl flex-col">
      {/* Header - Stitch parity: eyebrow + headline */}
      <div className="mb-8">
        <p className="font-mono text-[0.875rem] uppercase tracking-[0.05em] text-on-surface-variant">{t('emailPreferences')}</p>
        <h2 className="mt-2 font-display text-[2rem] font-medium leading-[1.2] text-on-surface md:text-[2rem]">How we reach you.</h2>
      </div>

      {/* Master toggle card */}
      <div className="mb-8 flex items-start justify-between rounded-xl border border-outline-variant/30 bg-surface-container-low p-6">
        <div className="pr-6">
          <h3 className="font-display text-[1.25rem] font-medium leading-tight text-on-surface">Engagement emails</h3>
          <p className="mt-2 text-sm leading-relaxed text-on-surface-variant">{t('engagementEmailDescription')}</p>
        </div>
        <Toggle
          id="email-preferences-toggle"
          ariaLabel={t('emailPreferences')}
          checked={enabled}
          disabled={saving || loadFailed}
          onChange={(next) => {
            void toggle(next);
          }}
        />
      </div>

      {/* Grouped preference rows */}
      <div className="border-t border-outline-variant/30">
        {/* Order updates locked */}
        <div className="flex items-start justify-between border-b border-outline-variant/30 py-5 opacity-70">
          <div className="pr-6">
            <h4 className="flex items-center gap-2 text-[1.05rem] font-medium leading-none text-on-surface">
              Order updates
              <Lock className="h-4 w-4 text-sage" aria-hidden />
            </h4>
            <p className="mt-1 text-sm text-on-surface-variant">Essential info about your active orders.</p>
          </div>
          <Toggle checked disabled ariaLabel="Order updates" onChange={() => {}} />
        </div>

        {/* Abandoned bag */}
        <div className="flex items-start justify-between border-b border-outline-variant/30 py-5">
          <div className="pr-6">
            <h4 className="text-[1.05rem] font-medium leading-none text-on-surface">Abandoned bag reminder</h4>
            <p className="mt-1 text-sm text-on-surface-variant">A gentle nudge when you leave stems in your bag.</p>
          </div>
          <Toggle
            checked={bag}
            disabled={saving || loadFailed || !enabled}
            ariaLabel="Abandoned bag reminder"
            onChange={(next) => setBag(next)}
          />
        </div>

        {/* Wishlist price drops */}
        <div className="flex items-start justify-between border-b border-outline-variant/30 py-5">
          <div className="pr-6">
            <h4 className="text-[1.05rem] font-medium leading-none text-on-surface">Wishlist price drops</h4>
            <p className="mt-1 text-sm text-on-surface-variant">Be the first to know when your favorites are curated for less.</p>
          </div>
          <Toggle
            checked={wishlistDrop}
            disabled={saving || loadFailed || !enabled}
            ariaLabel="Wishlist price drops"
            onChange={(next) => setWishlistDrop(next)}
          />
        </div>

        {/* Back-in-stock */}
        <div className="flex items-start justify-between border-b border-outline-variant/30 py-5">
          <div className="pr-6">
            <h4 className="text-[1.05rem] font-medium leading-none text-on-surface">Back-in-stock alerts</h4>
            <p className="mt-1 text-sm text-on-surface-variant">Alerts for when seasonal blooms return to the studio.</p>
          </div>
          <Toggle
            checked={backInStock}
            disabled={saving || loadFailed || !enabled}
            ariaLabel="Back-in-stock alerts"
            onChange={(next) => setBackInStock(next)}
          />
        </div>

        {/* Seasonal */}
        <div className="flex items-start justify-between border-b border-outline-variant/30 py-5">
          <div className="pr-6">
            <h4 className="text-[1.05rem] font-medium leading-none text-on-surface">Seasonal collection notes</h4>
            <p className="mt-1 text-sm text-on-surface-variant">Editorial stories and early access to new gestures.</p>
          </div>
          <Toggle checked={seasonal} disabled={saving || loadFailed || !enabled} ariaLabel="Seasonal collection notes" onChange={(next) => setSeasonal(next)} />
        </div>
      </div>

      {/* Inline feedback */}
      {message ? (
        <div
          role={error ? 'alert' : 'status'}
          className={`mt-4 flex items-center gap-2 text-sm ${error ? 'text-destructive' : 'text-sage'}`}
        >
          <CheckCircle2 className={`h-[18px] w-[18px] ${error ? 'text-destructive' : 'text-sage'}`} aria-hidden />
          <span>{message}</span>
        </div>
      ) : null}

      {/* Language preference */}
      <div className="mt-10 border-t border-outline-variant/30 pt-8">
        <h3 className="font-display text-[1.5rem] font-medium leading-tight text-on-surface">Correspondence language</h3>
        <div className="mt-4 flex flex-wrap gap-3">
          <label className="cursor-pointer">
            <input
              className="peer sr-only"
              name="language"
              type="radio"
              value="en"
              checked={lang === 'en'}
              onChange={() => handleLanguageChange('en')}
            />
            <span className="inline-block rounded-full border border-outline-variant/50 px-6 py-2 text-sm text-on-surface-variant transition-colors peer-checked:border-primary-container peer-checked:bg-primary-container peer-checked:text-on-primary-container">
              English
            </span>
          </label>
          <label className="cursor-pointer">
            <input
              className="peer sr-only"
              name="language"
              type="radio"
              value="ar"
              checked={lang === 'ar'}
              onChange={() => handleLanguageChange('ar')}
            />
            <span className="inline-block rounded-full border border-outline-variant/50 px-6 py-2 text-sm text-on-surface-variant transition-colors peer-checked:border-primary-container peer-checked:bg-primary-container peer-checked:text-on-primary-container">
              العربية
            </span>
          </label>
          <label className="cursor-pointer">
            <input className="peer sr-only" name="language" type="radio" value="fr" checked={lang === 'fr'} onChange={() => handleLanguageChange('fr')} />
            <span className="inline-block rounded-full border border-outline-variant/50 px-6 py-2 text-sm text-on-surface-variant transition-colors peer-checked:border-primary-container peer-checked:bg-primary-container peer-checked:text-on-primary-container">
              Français
            </span>
          </label>
        </div>
      </div>

      {/* Save button */}
      <div className="mt-8 flex justify-end">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving || loadFailed}
          className="inline-flex h-11 items-center justify-center rounded bg-primary px-8 text-sm font-medium text-on-primary shadow-sm transition-colors hover:bg-surface-tint active:scale-[0.98] disabled:opacity-50"
        >
          {saving ? t('processing') : 'Save changes'}
        </button>
      </div>
    </section>
  );
}
