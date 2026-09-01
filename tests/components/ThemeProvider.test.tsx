import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider, useTheme } from '@/features/theme/ThemeProvider';

function Probe() {
  const { theme, setTheme } = useTheme();
  return <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme}</button>;
}

describe('ThemeProvider', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.cookie = 'rosette.theme=; path=/; max-age=0';
    document.documentElement.classList.remove('dark');
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  });
  afterEach(() => { vi.unstubAllGlobals(); document.documentElement.classList.remove('dark'); });

  it('defaults to system preference and flips the html class', async () => {
    const user = userEvent.setup();
    render(<ThemeProvider><Probe /></ThemeProvider>);
    expect(screen.getByRole('button')).toHaveTextContent('light');
    await user.click(screen.getByRole('button'));
    expect(screen.getByRole('button')).toHaveTextContent('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('restores a saved preference from localStorage', async () => {
    window.localStorage.setItem('rosette.theme.v1', 'dark');
    render(<ThemeProvider><Probe /></ThemeProvider>);
    // The stored preference applies one tick after mount (deferred task).
    await act(async () => {});
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('falls back to the theme cookie (SSR path) when localStorage is empty', async () => {
    document.cookie = 'rosette.theme=dark; path=/';
    render(<ThemeProvider><Probe /></ThemeProvider>);
    await act(async () => {});
    expect(screen.getByRole('button')).toHaveTextContent('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('persists the choice and mirrors it to a cookie', async () => {
    const user = userEvent.setup();
    render(<ThemeProvider><Probe /></ThemeProvider>);
    await user.click(screen.getByRole('button'));
    expect(window.localStorage.getItem('rosette.theme.v1')).toBe('dark');
    expect(document.cookie).toContain('rosette.theme=dark');
  });

  it('preserves the server-rendered dark class during hydration', async () => {
    document.cookie = 'rosette.theme=dark; path=/';
    document.documentElement.classList.add('dark');
    render(<ThemeProvider><Probe /></ThemeProvider>);
    expect(screen.getByRole('button')).toHaveTextContent('dark');
    await act(async () => {});
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('follows system theme changes when no explicit preference exists', async () => {
    let listener: ((event: MediaQueryListEvent) => void) | undefined;
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
      matches: false,
      addEventListener: (_type: string, callback: (event: MediaQueryListEvent) => void) => { listener = callback; },
      removeEventListener: vi.fn(),
    }));
    render(<ThemeProvider><Probe /></ThemeProvider>);
    await act(async () => {});
    expect(listener).toBeTypeOf('function');
    act(() => listener?.({ matches: true } as MediaQueryListEvent));
    expect(screen.getByRole('button')).toHaveTextContent('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('does not follow system changes after an explicit preference is saved', async () => {
    let listener: ((event: MediaQueryListEvent) => void) | undefined;
    window.localStorage.setItem('rosette.theme.v1', 'light');
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
      matches: true,
      addEventListener: (_type: string, callback: (event: MediaQueryListEvent) => void) => { listener = callback; },
      removeEventListener: vi.fn(),
    }));
    render(<ThemeProvider><Probe /></ThemeProvider>);
    await act(async () => {});
    expect(listener).toBeUndefined();
    expect(screen.getByRole('button')).toHaveTextContent('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
});
