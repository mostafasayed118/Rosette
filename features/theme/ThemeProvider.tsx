'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { deferToTask } from '@/hooks/use-deferred-task';

const STORAGE_KEY = 'rosette.theme.v1';
type Theme = 'light' | 'dark';
type ThemeContextValue = { theme: Theme; setTheme: (theme: Theme) => void };
const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('light');
  const setTheme = (next: Theme) => {
    setThemeState(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, next);
      document.cookie = `rosette.theme=${next}; path=/; max-age=31536000; samesite=lax`;
    }
  };
  useEffect(() => {
    // Deferred so the first commit settles from the SSR snapshot before the
    // stored preference flips the class on <html>.
    deferToTask(() => {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved === 'dark' || saved === 'light') { setThemeState(saved); return; }
      const cookieTheme = document.cookie.split('; ').find((part) => part.startsWith('rosette.theme='))?.split('=')[1];
      if (cookieTheme === 'dark' || cookieTheme === 'light') { setThemeState(cookieTheme); return; }
      const prefersDark = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches;
      setThemeState(prefersDark ? 'dark' : 'light');
    });
  }, []);
  useEffect(() => { document.documentElement.classList.toggle('dark', theme === 'dark'); }, [theme]);
  const value = { theme, setTheme };
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() { const value = useContext(ThemeContext); if (!value) throw new Error('useTheme must be used inside ThemeProvider'); return value; }
