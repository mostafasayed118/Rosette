import type { ReactElement } from 'react';
import { render } from '@testing-library/react';
import { I18nProvider } from '@/features/i18n/I18nProvider';
import { ThemeProvider } from '@/features/theme/ThemeProvider';

export function renderWithProviders(ui: ReactElement) {
  return render(<ThemeProvider><I18nProvider>{ui}</I18nProvider></ThemeProvider>);
}
