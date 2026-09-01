import type { ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, screen } from '@testing-library/react';
import { WishlistProvider } from '@/features/wishlist/WishlistProvider';
import { BuyAgainStrip } from '@/features/personalization/components/BuyAgainStrip';
import { RecommendedCarousel } from '@/features/personalization/components/RecommendedCarousel';
import { PersonalizationSkeleton } from '@/features/personalization/components/PersonalizationSkeleton';
import { I18nProvider } from '@/features/i18n/I18nProvider';
import { ThemeProvider } from '@/features/theme/ThemeProvider';
import { products } from '@/features/catalog/data';
import { storeHref } from '@/features/i18n/store-path';
import type { Locale } from '@/features/i18n/types';
import { renderWithProviders } from '../test-utils';

const nav = vi.hoisted(() => ({
  pathname: '/en/greater-cairo',
  params: { locale: 'en', city: 'greater-cairo' },
}));

vi.mock('next/navigation', () => ({
  useParams: () => nav.params,
  usePathname: () => nav.pathname,
}));

// Mirrors what the server page passes down: an explicit locale plus a path
// builder already bound to the `/{locale}/{city}` prefix.
function cardProps(locale: Locale = 'en') {
  return { locale, href: (path: string) => storeHref(`/${locale}/greater-cairo`, path) };
}

function renderBuyAgain(items = products.slice(0, 2), locale: Locale = 'en') {
  return renderWithProviders(
    <WishlistProvider>
      <BuyAgainStrip products={items} {...cardProps(locale)} />
    </WishlistProvider>,
  );
}

function renderRecommended(items = products.slice(0, 2), locale: Locale = 'en') {
  return renderWithProviders(
    <WishlistProvider>
      <RecommendedCarousel products={items} {...cardProps(locale)} />
    </WishlistProvider>,
  );
}

function renderWithAr(ui: ReactNode) {
  // Align the next/navigation mock with the Arabic provider so the
  // path-derived locale effect inside I18nProvider does not snap back to en.
  nav.pathname = '/ar/greater-cairo';
  nav.params = { locale: 'ar', city: 'greater-cairo' };
  return renderWithProviders(
    <ThemeProvider>
      <I18nProvider initialLocale="ar">{ui}</I18nProvider>
    </ThemeProvider>,
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
        <RecommendedCarousel products={products.slice(0, 2)} {...cardProps()} category="hand-bouquet" />
      </WishlistProvider>,
    );
    expect(screen.getByText(/hand-bouquet/i)).toBeInTheDocument();
  });

  it('BuyAgainStrip renders localized Arabic aria-label and flips html dir to rtl', async () => {
    nav.pathname = '/ar/greater-cairo';
    nav.params = { locale: 'ar', city: 'greater-cairo' };
    renderWithAr(
      <WishlistProvider>
        <BuyAgainStrip products={products.slice(0, 1)} {...cardProps('ar')} />
      </WishlistProvider>,
    );
    // The stored wishlist resolves one tick after mount (deferred task).
    await act(async () => {});
    // Arabic dictionary value for personalizationBuyAgain is "اشتري تاني".
    const section = screen.getByRole('region', { name: /اشتري تاني/i });
    expect(section).toBeInTheDocument();
    expect(document.documentElement.dir).toBe('rtl');
  });
});

describe('PersonalizationSkeleton', () => {
  beforeEach(() => {
    nav.pathname = '/en/greater-cairo';
    nav.params = { locale: 'en', city: 'greater-cairo' };
  });

  it('renders three shimmer cards with aria-hidden and a localized aria-label', () => {
    renderWithProviders(
      <WishlistProvider>
        <PersonalizationSkeleton />
      </WishlistProvider>,
    );
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-busy', 'true');
    expect(status).toHaveAttribute('aria-live', 'polite');
    // en dictionary value is "Recommended for you"
    expect(status).toHaveAttribute('aria-label', expect.stringMatching(/recommended for you/i));
    const shimmers = document.querySelectorAll('[aria-hidden="true"]');
    // 3 shimmering cards with aria-hidden="true"
    expect(shimmers.length).toBeGreaterThanOrEqual(3);
    shimmers.forEach((node) => expect(node).toHaveAttribute('aria-hidden', 'true'));
  });

  it('honors the locale provided by the surrounding I18nProvider', () => {
    renderWithAr(
      <WishlistProvider>
        <PersonalizationSkeleton />
      </WishlistProvider>,
    );
    const status = screen.getByRole('status');
    // ar dictionary value for personalizationRecommended is "مقترح ليك"
    expect(status).toHaveAttribute('aria-label', expect.stringMatching(/مقترح ليك/));
  });
});
