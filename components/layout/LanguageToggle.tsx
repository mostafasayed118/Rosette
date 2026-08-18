'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useI18n } from '@/features/i18n/I18nProvider';
import type { Locale } from '@/features/i18n/types';

const cycle: Locale[] = ['en', 'ar', 'fr'];

export function LanguageToggle() {
  const { locale, setLocale, t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();

  function toggle() {
    const segments = pathname.split('/').filter(Boolean);
    const first = segments[0];
    if (first && (cycle as string[]).includes(first)) {
      const current = first as Locale;
      const next = cycle[(cycle.indexOf(current) + 1) % cycle.length] ?? 'en';
      segments[0] = next;
      router.push(`/${segments.join('/')}`);
    } else {
      // Non-prefixed page (e.g. admin) — fall back to the cookie swap.
      const next = cycle[(cycle.indexOf(locale) + 1) % cycle.length] ?? 'en';
      setLocale(next);
      router.refresh();
    }
  }

  return <button className="grid h-11 min-w-11 place-items-center rounded-full px-2 text-xs font-bold text-primary hover:bg-accent" type="button" onClick={toggle} aria-label={t('language')}>{t('language')}</button>;
}
