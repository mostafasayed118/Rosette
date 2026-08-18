import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Badge } from '@/components/ui/badge';

describe('Badge', () => {
  it('renders the success variant with its label', () => {
    const { container } = render(<Badge variant="success">Paid</Badge>);
    expect(screen.getByText('Paid')).toBeInTheDocument();
    expect(container.firstChild).toHaveAttribute('data-variant', 'success');
  });

  it('renders the warning variant with its label', () => {
    const { container } = render(<Badge variant="warning">Refunded</Badge>);
    expect(screen.getByText('Refunded')).toBeInTheDocument();
    expect(container.firstChild).toHaveAttribute('data-variant', 'warning');
  });
});
