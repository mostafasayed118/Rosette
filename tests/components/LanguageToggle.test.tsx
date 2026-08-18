import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/features/i18n/I18nProvider';
import { LanguageToggle } from '@/components/layout/LanguageToggle';
import { renderWithProviders } from '../test-utils';

const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock('next/navigation', () => ({
  usePathname: () => '/en/greater-cairo/shop',
  useRouter: () => ({ push, refresh: vi.fn() }),
  useParams: () => ({ locale: 'en', city: 'greater-cairo' }),
}));

describe('LanguageToggle', () => {
  it('navigates to the same path under the next locale', () => {
    renderWithProviders(<I18nProvider><LanguageToggle /></I18nProvider>);
    fireEvent.click(screen.getByRole('button', { name: /العربية/i }));
    expect(push).toHaveBeenCalledWith('/ar/greater-cairo/shop');
  });
});
