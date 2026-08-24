import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CatalogGrid } from '@/features/catalog/CatalogGrid';
import { WishlistProvider } from '@/features/wishlist/WishlistProvider';
import type { Product } from '@/features/catalog/types';

vi.mock('next/navigation', () => ({
  useParams: () => ({ locale: 'en', city: 'greater-cairo' }),
  usePathname: () => '/en/greater-cairo/shop',
}));

import { renderWithProviders } from '../test-utils';

const product = (slug: string): Product => ({
  slug, name: `Bouquet ${slug}`, description: 'Soft seasonal stems', category: 'hand-bouquet',
  occasions: ['love'], price: 12500, tone: '#bc6d63', imageUrl: null, inventory: 5,
  delivery: 'Same-day in Cairo', createdAt: '2026-01-01', variants: [], addOns: [],
});

function renderGrid(products: Product[]) {
  return renderWithProviders(<WishlistProvider><CatalogGrid products={products} /></WishlistProvider>);
}

describe('CatalogGrid', () => {
  it('renders one card per product in a responsive grid', () => {
    renderGrid([product('a'), product('b'), product('c'), product('d')]);
    expect(screen.getAllByRole('article')).toHaveLength(4);
    expect(screen.getByText('Bouquet a')).toBeInTheDocument();
  });

  it('staggers every middle-column card on desktop', () => {
    renderGrid([product('a'), product('b'), product('c'), product('d'), product('e'), product('f')]);
    const articles = screen.getAllByRole('article');
    expect(articles[1]?.className).toContain('lg:mt-16');
    expect(articles[4]?.className).toContain('lg:mt-16');
    expect(articles[0]?.className).not.toContain('lg:mt-16');
  });

  it('renders the Stitch card face: name, subtitle, price — no category eyebrow or delivery line', () => {
    renderGrid([product('a')]);
    expect(screen.getByText('Bouquet a')).toBeInTheDocument();
    expect(screen.getByText('Soft seasonal stems')).toBeInTheDocument();
    expect(screen.getByText(/EGP/)).toBeInTheDocument();
    expect(screen.queryByText(/hand bouquet/i)).not.toBeInTheDocument();
  });
});
