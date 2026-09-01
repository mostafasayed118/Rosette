import { readFileSync } from 'node:fs';
import path from 'node:path';
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
  delivery: 'Same-day in Cairo', deliveryTier: 'same_day', createdAt: '2026-01-01', variants: [], addOns: [],
});

function renderGrid(products: Product[]) {
  return renderWithProviders(
    <WishlistProvider>
      <CatalogGrid products={products} locale="en" href={(path) => `/en/greater-cairo${path}`} />
    </WishlistProvider>,
  );
}

describe('CatalogGrid', () => {
  it('renders one card per product in a responsive grid', () => {
    renderGrid([product('a'), product('b'), product('c'), product('d')]);
    expect(screen.getAllByRole('article')).toHaveLength(4);
    expect(screen.getByText('Bouquet a')).toBeInTheDocument();
  });

  it('keeps sparse result sets balanced instead of creating an orphaned staggered card', () => {
    renderGrid([product('a'), product('b'), product('c'), product('d')]);
    const articles = screen.getAllByRole('article');
    expect(articles[1]?.className).not.toContain('lg:mt-16');
    expect(articles[3]?.className).not.toContain('lg:mt-16');
  });

  it('keeps the editorial stagger for larger result sets', () => {
    renderGrid([product('a'), product('b'), product('c'), product('d'), product('e'), product('f')]);
    const articles = screen.getAllByRole('article');
    expect(articles[1]?.className).toContain('lg:mt-16');
    expect(articles[4]?.className).toContain('lg:mt-16');
    expect(articles[0]?.className).not.toContain('lg:mt-16');
  });

  it('renders comparison data: name, subtitle, price, and delivery promise', () => {
    renderGrid([product('a')]);
    expect(screen.getByText('Bouquet a')).toBeInTheDocument();
    expect(screen.getByText('Soft seasonal stems')).toBeInTheDocument();
    expect(screen.getByText(/EGP/)).toBeInTheDocument();
    expect(screen.getByText('Same-day delivery')).toBeInTheDocument();
    expect(screen.queryByText(/hand bouquet/i)).not.toBeInTheDocument();
  });

  // R-30: the grid and card must stay server-renderable. Adding 'use client'
  // (or re-introducing useI18n/useStorePath) would push the whole catalog back
  // into the client bundle — this guard fails loudly instead.
  // R-30: the grid and card must stay server-renderable. Re-introducing the
  // client-only hooks would pull the whole catalog back into the client bundle —
  // this guard fails loudly instead. A mention inside a doc comment is fine; only
  // real imports / hook calls are forbidden.
  it('keeps CatalogGrid and ProductCard free of client-only hooks', () => {
    for (const file of ['features/catalog/CatalogGrid.tsx', 'features/catalog/ProductCard.tsx']) {
      const source = readFileSync(path.resolve(process.cwd(), file), 'utf8');
      expect(source).not.toMatch(/^\s*['"]use client['"]/m);
      expect(source).not.toMatch(/from ['"]@\/features\/i18n\/use-store-path['"]/);
      expect(source).not.toMatch(/\buseStorePath\s*\(/);
      expect(source).not.toMatch(/from ['"]@\/features\/i18n\/I18nProvider['"]/);
      expect(source).not.toMatch(/\buseI18n\s*\(/);
    }
  });
});
