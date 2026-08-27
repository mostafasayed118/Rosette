import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/tests/test-utils';
import { ErrorShell } from '@/components/error/ErrorShell';

describe('ErrorShell', () => {
  it('renders the eyebrow, title, and lede copy', () => {
    renderWithProviders(
      <ErrorShell
        status={404}
        eyebrow="A quiet detour"
        title="That page has wandered off."
        lede="Let us take you back to the collection."
      />,
    );
    expect(screen.getByText('A quiet detour')).toBeInTheDocument();
    expect(screen.getByText('That page has wandered off.')).toBeInTheDocument();
    expect(screen.getByText('Let us take you back to the collection.')).toBeInTheDocument();
  });

  it('renders the status code numerically with brand spacing', () => {
    renderWithProviders(
      <ErrorShell status={403} eyebrow="Out of bounds" title="No entry." lede="Forbidden." />,
    );
    expect(screen.getByTestId('error-status')).toHaveTextContent('4·0·3');
  });

  it('renders a primary action link when action is provided', () => {
    renderWithProviders(
      <ErrorShell
        status={404}
        eyebrow="A quiet detour"
        title="Off we go."
        lede="Back to the collection."
        action={{ label: 'Browse flowers', href: '/en' }}
      />,
    );
    const link = screen.getByRole('link', { name: /browse flowers/i });
    expect(link).toHaveAttribute('href', '/en');
  });

  it('renders a secondary action when provided alongside the primary', () => {
    renderWithProviders(
      <ErrorShell
        status={500}
        eyebrow="A small pause"
        title="Something wilted."
        lede="Try again."
        action={{ label: 'Try again', onRetry: () => undefined }}
        secondaryAction={{ label: 'Back to home', href: '/en' }}
      />,
    );
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back to home/i })).toHaveAttribute('href', '/en');
  });

  it('renders the error digest reference when provided', () => {
    renderWithProviders(
      <ErrorShell
        status={500}
        eyebrow="A small pause"
        title="Something wilted."
        lede="Try again."
        digest="abc123"
        digestLabel="Reference"
      />,
    );
    expect(screen.getByText('abc123')).toBeInTheDocument();
    expect(screen.getByText('Reference')).toBeInTheDocument();
  });
});
