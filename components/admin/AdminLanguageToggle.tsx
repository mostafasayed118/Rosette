'use client';

import { useRouter } from 'next/navigation';
import { useI18n } from '@/features/i18n/I18nProvider';
import type { Locale } from '@/features/i18n/types';

/**
 * Admin-scoped language picker. The admin is served from non-prefixed
 * routes (`/admin`, `/login`), so locale lives in the `rosette.locale`
 * cookie + localStorage (see `I18nProvider` + `resolveServerLocale`).
 * This control writes both and refreshes the server so `getServerT()` picks
 * up the new locale. Untranslated keys fall back to English via
 * `translate()` — see `features/i18n/translate.ts:191`.
 */
type AdminLocale = 'en' | 'ar';

export function AdminLanguageToggle() {
  const { locale, setLocale, t } = useI18n();
  const router = useRouter();
  // Admin is EN/AR only — FR (storefront) falls back to EN.
  const adminLocale: AdminLocale = locale === 'ar' ? 'ar' : 'en';

  function switchTo(next: AdminLocale) {
    if (next === adminLocale) return;
    setLocale(next);
    router.refresh();
  }

  return (
    <div role="group" aria-label={t('languagePicker')} className="inline-flex items-center gap-0.5 rounded-full bg-muted/50 p-0.5">
      {(['en', 'ar'] as AdminLocale[]).map((l) => {
        const isActive = l === adminLocale;
        const label = l === 'en' ? t('languageEn') : t('languageAr');
        return (
          <button
            key={l}
            type="button"
            aria-pressed={isActive}
            aria-label={label}
            onClick={() => switchTo(l)}
            className={
              'min-w-9 rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-wide transition-colors ' +
              (isActive ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-background hover:text-foreground')
            }
          >
            {l}
          </button>
        );
      })}
    </div>
  );
}
