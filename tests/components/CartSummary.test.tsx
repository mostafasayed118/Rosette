import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CartSummary } from '@/features/cart/CartSummary';
import { renderWithProviders } from '../test-utils';

describe('CartSummary', () => {
  it('renders subtotal, delivery and total without a discount line', () => {
    renderWithProviders(<CartSummary totals={{ subtotal: 1000, deliveryFee: 1500, total: 2500 }} />);
    expect(screen.getByText('Subtotal')).toBeInTheDocument();
    expect(screen.getByText('Delivery')).toBeInTheDocument();
    expect(screen.getByText('Total')).toBeInTheDocument();
    expect(screen.queryByText('Discount')).not.toBeInTheDocument();
  });

  it('shows a discount line when a promo discount applies', () => {
    const { container } = renderWithProviders(<CartSummary totals={{ subtotal: 1000, deliveryFee: 1500, discountMinor: 200, total: 2300 }} />);
    const discountRow = container.querySelector('.text-success');
    expect(discountRow).not.toBeNull();
    expect(discountRow?.textContent).toContain('Discount');
    expect(discountRow?.textContent).toContain('EGP\u00A02');
  });
});
