import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/features/i18n/I18nProvider';
import { LanguageToggle } from '@/components/layout/LanguageToggle';
import { renderWithProviders } from '../test-utils';

const { push, refresh } = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));

vi.mock('next/navigation', () => ({
  usePathname: () => '/en/greater-cairo/shop',
  useRouter: () => ({ push, refresh }),
  useParams: () => ({ locale: 'en', city: 'greater-cairo' }),
}));

describe('LanguageToggle', () => {
  beforeEach(() => {
    push.mockClear();
    refresh.mockClear();
  });

  it('marks the current locale as pressed and leaves the others unpressed', () => {
    renderWithProviders(<I18nProvider><LanguageToggle /></I18nProvider>);
    expect(screen.getByRole('button', { name: 'English' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'العربية' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Français' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('exposes a group label for assistive tech', () => {
    renderWithProviders(<I18nProvider><LanguageToggle /></I18nProvider>);
    expect(screen.getByRole('group', { name: 'Language' })).toBeInTheDocument();
  });

  it('navigates to the same path under the chosen locale when one is clicked', () => {
    renderWithProviders(<I18nProvider><LanguageToggle /></I18nProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Français' }));
    expect(push).toHaveBeenCalledWith('/fr/greater-cairo/shop');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('does not push when the active locale button is clicked again', () => {
    renderWithProviders(<I18nProvider><LanguageToggle /></I18nProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'English' }));
    expect(push).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });
});