'use client';

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { deferToTask } from '@/hooks/use-deferred-task';

const STORAGE_KEY = 'rosette.theme.v1';
type Theme = 'light' | 'dark';
type ThemeContextValue = { theme: Theme; setTheme: (theme: Theme) => void };
const ThemeContext = createContext<ThemeContextValue | null>(null);

function isTheme(value: string | null | undefined): value is Theme {
  return value === 'dark' || value === 'light';
}

function readStoredTheme(): Theme | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return isTheme(value) ? value : null;
  } catch {
    return null;
  }
}

function readCookieTheme(): Theme | null {
  const value = document.cookie.split('; ').find((part) => part.startsWith('rosette.theme='))?.split('=')[1];
  return isTheme(value) ? value : null;
}

function getInitialTheme(): Theme {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

function persistTheme(next: Theme): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Private browsing or blocked storage should not prevent theme switching.
  }
  document.cookie = `rosette.theme=${next}; path=/; max-age=31536000; samesite=lax`;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme);
  const explicitPreferenceRef = useRef(false);
  const setTheme = (next: Theme) => {
    explicitPreferenceRef.current = true;
    setThemeState(next);
    if (typeof window !== 'undefined') persistTheme(next);
  };

  useEffect(() => {
    let mediaQuery: MediaQueryList | null = null;
    let handleChange: ((event: MediaQueryListEvent) => void) | null = null;
    let disposed = false;

    // Deferred so the first commit settles from the SSR snapshot before the
    // stored preference is reconciled with the class already applied to <html>.
    deferToTask(() => {
      if (disposed || explicitPreferenceRef.current) return;
      const saved = readStoredTheme();
      if (saved) {
        explicitPreferenceRef.current = true;
        setThemeState(saved);
        return;
      }
      const cookieTheme = readCookieTheme();
      if (cookieTheme) {
        explicitPreferenceRef.current = true;
        setThemeState(cookieTheme);
        return;
      }

      mediaQuery = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null;
      setThemeState(mediaQuery?.matches ? 'dark' : 'light');
      if (!mediaQuery) return;
      handleChange = (event) => {
        if (!explicitPreferenceRef.current) setThemeState(event.matches ? 'dark' : 'light');
      };
      mediaQuery.addEventListener?.('change', handleChange);
      mediaQuery.addListener?.(handleChange);
    });

    return () => {
      disposed = true;
      if (!mediaQuery || !handleChange) return;
      mediaQuery.removeEventListener?.('change', handleChange);
      mediaQuery.removeListener?.(handleChange);
    };
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  const value = { theme, setTheme };
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() { const value = useContext(ThemeContext); if (!value) throw new Error('useTheme must be used inside ThemeProvider'); return value; }
