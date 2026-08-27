import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithProviders } from '@/tests/test-utils';
import LocaleError from '@/app/[locale]/error';

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('app/[locale]/error', () => {
  it('renders the 500 ErrorShell with error copy', () => {
    renderWithProviders(
      <LocaleError
        error={new Error('boom')}
        reset={() => undefined}
      />,
    );
    expect(screen.getByTestId('error-status')).toHaveTextContent('5·0·0');
    expect(screen.getByText('Something wilted for a moment.')).toBeInTheDocument();
  });

  it('calls retry when the action button is clicked', () => {
    const reset = vi.fn();
    renderWithProviders(
      <LocaleError error={new Error('boom')} reset={reset} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('renders the digest reference when the error has a digest', () => {
    const error = new Error('boom') as Error & { digest?: string };
    error.digest = 'server-ref-abc';
    renderWithProviders(<LocaleError error={error} reset={() => undefined} />);
    expect(screen.getByText('server-ref-abc')).toBeInTheDocument();
  });

  it('renders a secondary link back to the current locale home', () => {
    window.history.pushState({}, '', '/ar/nope');
    renderWithProviders(
      <LocaleError error={new Error('boom')} reset={() => undefined} />,
    );
    const links = screen.getAllByRole('link');
    const homeLink = links.find((el) => /^\/(en|ar|fr)$/.test(el.getAttribute('href') ?? ''));
    expect(homeLink).toBeDefined();
  });
});
