import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { WishlistProvider } from '@/features/wishlist/WishlistProvider';
import { BuyAgainStrip } from '@/features/personalization/components/BuyAgainStrip';
import { RecommendedCarousel } from '@/features/personalization/components/RecommendedCarousel';
import { products } from '@/features/catalog/data';
import { renderWithProviders } from '../test-utils';

vi.mock('next/navigation', () => ({
  useParams: () => ({ locale: 'en', city: 'greater-cairo' }),
  usePathname: () => '/en/greater-cairo',
}));

function renderBuyAgain(items = products.slice(0, 2)) {
  return renderWithProviders(
    <WishlistProvider>
      <BuyAgainStrip products={items} locale="en" />
    </WishlistProvider>,
  );
}

function renderRecommended(items = products.slice(0, 2)) {
  return renderWithProviders(
    <WishlistProvider>
      <RecommendedCarousel products={items} locale="en" />
    </WishlistProvider>,
  );
}

describe('PersonalizationCarousels', () => {
  it('BuyAgainStrip renders a labelled section with the "Buy again" heading', () => {
    renderBuyAgain();
    expect(screen.getByLabelText(/buy again/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /buy again/i })).toBeInTheDocument();
  });

  it('BuyAgainStrip renders nothing when products list is empty', () => {
    renderBuyAgain([]);
    expect(screen.queryByLabelText(/buy again/i)).not.toBeInTheDocument();
  });

  it('BuyAgainStrip renders one ProductCard per product', () => {
    renderBuyAgain();
    expect(screen.getAllByRole('article')).toHaveLength(2);
  });

  it('RecommendedCarousel renders a labelled section with the "Recommended for you" heading', () => {
    renderRecommended();
    expect(screen.getByLabelText(/recommended for you/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /recommended for you/i })).toBeInTheDocument();
  });

  it('RecommendedCarousel surfaces a category hint when provided', () => {
    renderWithProviders(
      <WishlistProvider>
        <RecommendedCarousel products={products.slice(0, 2)} locale="en" category="hand-bouquet" />
      </WishlistProvider>,
    );
    expect(screen.getByText(/hand-bouquet/i)).toBeInTheDocument();
  });
});
