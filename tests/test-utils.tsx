import type { ReactElement } from 'react';
import { render } from '@testing-library/react';
import { I18nProvider } from '@/features/i18n/I18nProvider';

export function renderWithProviders(ui: ReactElement) {
  return render(<I18nProvider>{ui}</I18nProvider>);
}
