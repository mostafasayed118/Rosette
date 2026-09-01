import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { I18nProvider } from '@/features/i18n/I18nProvider';
import { AdminLanguageToggle } from '@/components/admin/AdminLanguageToggle';
import { renderWithProviders } from '../test-utils';

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
  usePathname: () => '/admin',
}));

describe('AdminLanguageToggle', () => {
  beforeEach(() => {
    refresh.mockClear();
    window.localStorage.clear();
    document.cookie = 'rosette.locale=; path=/; max-age=0';
  });

  it('marks the current locale as pressed and shows only EN/AR', () => {
    renderWithProviders(
      <I18nProvider initialLocale="en">
        <AdminLanguageToggle />
      </I18nProvider>,
    );
    expect(screen.getByRole('button', { name: 'English' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'العربية' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByRole('button', { name: 'Français' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });

  it('treats FR storefront locale as EN fallback in admin', () => {
    renderWithProviders(
      <I18nProvider initialLocale="fr">
        <AdminLanguageToggle />
      </I18nProvider>,
    );
    // FR falls back to EN in admin
    expect(screen.getByRole('button', { name: 'English' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'العربية' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('switches locale, persists to localStorage and cookie, and refreshes', () => {
    renderWithProviders(
      <I18nProvider initialLocale="en">
        <AdminLanguageToggle />
      </I18nProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'العربية' }));
    expect(window.localStorage.getItem('rosette.locale.v1')).toBe('ar');
    expect(document.cookie).toMatch(/rosette\.locale=ar/);
    expect(refresh).toHaveBeenCalled();
    expect(document.documentElement.dir).toBe('rtl');
  });

  it('does not refresh when active locale is clicked again', () => {
    renderWithProviders(
      <I18nProvider initialLocale="ar">
        <AdminLanguageToggle />
      </I18nProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'العربية' }));
    expect(refresh).not.toHaveBeenCalled();
  });

  it('exposes a group label for assistive tech', () => {
    renderWithProviders(
      <I18nProvider initialLocale="en">
        <AdminLanguageToggle />
      </I18nProvider>,
    );
    expect(screen.getByRole('group', { name: 'Language' })).toBeInTheDocument();
  });
});
