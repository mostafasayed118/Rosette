'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/features/theme/ThemeProvider';
import { useI18n } from '@/features/i18n/I18nProvider';

export function AdminThemeToggle() {
  const { theme, setTheme } = useTheme();
  const { t } = useI18n();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Prevent hydration mismatch — render placeholder until mounted
  if (!mounted) {
    return (
      <div
        className="inline-flex items-center gap-0.5 rounded-full bg-muted/50 p-0.5"
        aria-hidden
      >
        <span className="min-w-9 rounded-full px-2.5 py-1">
          <Sun className="h-3.5 w-3.5 opacity-0" />
        </span>
        <span className="min-w-9 rounded-full px-2.5 py-1">
          <Moon className="h-3.5 w-3.5 opacity-0" />
        </span>
      </div>
    );
  }

  const themes: Array<'light' | 'dark'> = ['light', 'dark'];

  return (
    <div role="group" aria-label={t('toggleTheme')} className="inline-flex items-center gap-0.5 rounded-full bg-muted/50 p-0.5">
      {themes.map((value) => {
        const isActive = theme === value;
        const Icon = value === 'light' ? Sun : Moon;
        // Prefer dedicated i18n keys if present, fall back to capitalised value
        const label =
          value === 'light'
            ? (t('themeLight') !== 'themeLight' ? t('themeLight') : 'Light')
            : (t('themeDark') !== 'themeDark' ? t('themeDark') : 'Dark');
        return (
          <button
            key={value}
            type="button"
            aria-pressed={isActive}
            aria-label={label}
            title={label}
            onClick={() => setTheme(value)}
            className={
              'inline-flex min-w-9 items-center justify-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-wide transition-colors ' +
              (isActive
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-background hover:text-foreground')
            }
          >
            <Icon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{value === 'light' ? 'Light' : 'Dark'}</span>
          </button>
        );
      })}
    </div>
  );
}
