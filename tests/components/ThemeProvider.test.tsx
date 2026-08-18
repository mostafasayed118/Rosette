import { render, screen } from '@testing-library/react';
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

  it('restores a saved preference from localStorage', () => {
    window.localStorage.setItem('rosette.theme.v1', 'dark');
    render(<ThemeProvider><Probe /></ThemeProvider>);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('persists the choice and mirrors it to a cookie', async () => {
    const user = userEvent.setup();
    render(<ThemeProvider><Probe /></ThemeProvider>);
    await user.click(screen.getByRole('button'));
    expect(window.localStorage.getItem('rosette.theme.v1')).toBe('dark');
    expect(document.cookie).toContain('rosette.theme=dark');
  });
});
