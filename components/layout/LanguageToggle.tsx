'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useI18n } from '@/features/i18n/I18nProvider';
import { LOCALES } from '@/lib/locale-routing';
import type { Locale } from '@/features/i18n/types';

function localeFromPath(pathname: string): Locale | null {
  const seg = pathname.split('/').filter(Boolean)[0];
  if (seg === 'en' || seg === 'ar' || seg === 'fr') return seg;
  return null;
}

function nativeLabelKey(locale: Locale): 'languageEn' | 'languageAr' | 'languageFr' {
  if (locale === 'en') return 'languageEn';
  if (locale === 'ar') return 'languageAr';
  return 'languageFr';
}

export function LanguageToggle() {
  const { locale, setLocale, t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const active: Locale = localeFromPath(pathname) ?? locale;

  function switchTo(next: Locale) {
    if (next === active) return;
    const segments = pathname.split('/').filter(Boolean);
    const first = segments[0];
    if (first && (LOCALES as string[]).includes(first)) {
      segments[0] = next;
      router.push(`/${segments.join('/')}`);
    } else {
      setLocale(next);
      router.refresh();
    }
  }

  return (
    <div role="group" aria-label={t('languagePicker')} className="inline-flex items-center gap-0.5 rounded-full bg-muted/50 p-0.5">
      {LOCALES.map((l) => {
        const isActive = l === active;
        return (
          <button
            key={l}
            type="button"
            aria-pressed={isActive}
            aria-label={t(nativeLabelKey(l))}
            onClick={() => switchTo(l)}
            className={
              'min-w-9 rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-wide transition-colors ' +
              (isActive
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-background hover:text-foreground')
            }
          >
            {l}
          </button>
        );
      })}
    </div>
  );
}