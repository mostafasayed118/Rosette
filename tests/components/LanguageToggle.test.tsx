import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { I18nProvider } from '@/features/i18n/I18nProvider';
import { LanguageToggle } from '@/components/layout/LanguageToggle';
import { renderWithProviders } from '../test-utils';

describe('LanguageToggle', () => {
  it('switches to Arabic, persists the locale, and sets RTL direction', async () => {
    renderWithProviders(<I18nProvider><LanguageToggle /></I18nProvider>);
    fireEvent.click(screen.getByRole('button', { name: /العربية/i }));
    await waitFor(() => expect(document.documentElement.dir).toBe('rtl'));
    expect(document.documentElement.lang).toBe('ar');
    expect(window.localStorage.getItem('rosette.locale.v1')).toBe('ar');
  });
});
