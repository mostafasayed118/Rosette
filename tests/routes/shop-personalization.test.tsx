import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import { I18nProvider } from '@/features/i18n/I18nProvider';
import { ThemeProvider } from '@/features/theme/ThemeProvider';

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
  getServerSupabase: vi.fn(),
}));

vi.mock('@/features/personalization/provider', () => ({
  getPersonalizationProvider: vi.fn(),
}));

// Stub the heavy client components so the page can be rendered in a test
// environment without React context (ThemeProvider / I18nProvider / CartProvider).
vi.mock('@/components/layout/SiteHeader', () => ({
  SiteHeader: () => null,
}));
vi.mock('@/components/layout/SiteFooter', () => ({
  SiteFooter: () => null,
}));
vi.mock('@/features/catalog/CatalogGrid', () => ({
  CatalogGrid: () => null,
}));
vi.mock('@/features/catalog/CatalogPagination', () => ({
  CatalogPagination: () => null,
}));
vi.mock('@/features/catalog/CatalogToolbar', () => ({
  CatalogToolbar: () => null,
}));
vi.mock('@/features/i18n/LocalizedPageHeading', () => ({
  LocalizedPageHeading: () => null,
}));
vi.mock('@/components/seo/SiteJsonLd', () => ({
  BreadcrumbJsonLd: () => null,
}));
vi.mock('@/features/product/ProductDetail', () => ({
  ProductDetail: () => null,
}));
vi.mock('@/components/reviews/ProductReviews', () => ({
  ProductReviews: () => null,
}));
vi.mock('@/components/seo/ProductJsonLd', () => ({
  ProductJsonLd: () => null,
}));
vi.mock('@/features/personalization/components/PersonalizationSkeleton', () => ({
  PersonalizationSkeleton: () => null,
}));
vi.mock('@/features/personalization/components/BuyAgainStrip', () => ({
  BuyAgainStrip: ({ products }: { products: any[] }) => (
    <section data-testid="buy-again" data-count={products.length}>{products.map((p) => p.slug).join(',')}</section>
  ),
}));
vi.mock('@/features/personalization/components/RecommendedCarousel', () => ({
  RecommendedCarousel: ({ products }: { products: any[] }) => (
    <section data-testid="recommended" data-count={products.length}>{products.map((p) => p.slug).join(',')}</section>
  ),
}));

const { createClient } = await import('@/lib/supabase/server');
const { getPersonalizationProvider } = await import('@/features/personalization/provider');
const mockCreateClient = vi.mocked(createClient);
const mockGetProvider = vi.mocked(getPersonalizationProvider);

const sampleProduct = {
  slug: 'rose-hour',
  name: 'Rose Hour',
  description: '',
  category: 'hand-bouquet',
  occasions: ['birthday'],
  price: 12000,
  tone: '#bc6d63',
  imageUrl: null,
  inventory: 0,
  delivery: 'Same-day',
  createdAt: '2026-01-01',
  variants: [],
  addOns: [],
  rating: { average: 0, count: 0 },
} as any;

const samplePicks = {
  buyAgain: [sampleProduct],
  recommended: [{ ...sampleProduct, slug: 'sunlit-stems', name: 'Sunlit' }],
  reason: 'history' as const,
};

const emptyPicks = { buyAgain: [], recommended: [], reason: 'fallback' as const };

function mockAuthedUser() {
  mockCreateClient.mockReturnValue({
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'uid-123' } } })) },
  } as any);
}

function mockAnonymous() {
  mockCreateClient.mockReturnValue({
    auth: { getUser: vi.fn(async () => ({ data: { user: null } })) },
  } as any);
}

function mockCatalog() {
  const repo = {
    list: vi.fn(async () => ({
      products: [sampleProduct],
      total: 1,
      query: {},
      page: 1,
      perPage: 8,
      totalPages: 1,
    })),
    getBySlug: vi.fn(async (slug: string) => (slug === sampleProduct.slug ? sampleProduct : null)),
    isDeliverable: vi.fn(async () => ({ eligible: true, reason: '', fee: 0 })),
  };
  vi.doMock('@/features/catalog/provider', () => ({
    getCatalogRepository: () => repo,
  }));
  return repo;
}

const shopPageParams = {
  params: Promise.resolve({ locale: 'en', city: 'cairo' }),
  searchParams: Promise.resolve({}),
};

const productPageParams = {
  params: Promise.resolve({ locale: 'en', city: 'cairo', slug: 'rose-hour' }),
};

function renderWithProviders(node: any) {
  return renderToString(<ThemeProvider><I18nProvider>{node}</I18nProvider></ThemeProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  delete process.env.ROSETTE_PERSONALIZATION_ENABLED;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
});

describe('ShopPage integration with personalization', () => {
  it('renders BuyAgainStrip + RecommendedCarousel above the catalog for an authed user', async () => {
    mockAuthedUser();
    const getPicks = vi.fn(async () => samplePicks);
    mockGetProvider.mockReturnValue({ getPicks } as any);
    mockCatalog();

    const mod = await import('@/app/[locale]/[city]/shop/(list)/page');
    const node = await mod.default(shopPageParams);
    const html = renderWithProviders(node);

    expect(getPicks).toHaveBeenCalledWith('uid-123', expect.objectContaining({ limit: 8, locale: 'en' }));
    expect(html).toContain('data-testid="buy-again"');
    expect(html).toContain('data-testid="recommended"');
    expect(html).toContain('data-count="1"');
    expect(html).toContain('rose-hour');
    expect(html).toContain('sunlit-stems');
  });

  it('does not call provider or render strips for an anonymous user', async () => {
    mockAnonymous();
    const getPicks = vi.fn();
    mockGetProvider.mockReturnValue({ getPicks } as any);
    mockCatalog();

    const mod = await import('@/app/[locale]/[city]/shop/(list)/page');
    const node = await mod.default(shopPageParams);
    const html = renderWithProviders(node);

    expect(getPicks).not.toHaveBeenCalled();
    expect(html).not.toContain('data-testid="buy-again"');
    expect(html).not.toContain('data-testid="recommended"');
  });

  it('does not render strips when ROSETTE_PERSONALIZATION_ENABLED === "false"', async () => {
    process.env.ROSETTE_PERSONALIZATION_ENABLED = 'false';
    mockAuthedUser();
    const getPicks = vi.fn();
    mockGetProvider.mockReturnValue({ getPicks } as any);
    mockCatalog();

    const mod = await import('@/app/[locale]/[city]/shop/(list)/page');
    const node = await mod.default(shopPageParams);
    const html = renderWithProviders(node);

    expect(getPicks).not.toHaveBeenCalled();
    expect(html).not.toContain('data-testid="buy-again"');
    expect(html).not.toContain('data-testid="recommended"');
  });

  it('does not block catalog when provider throws — strips hidden, page still renders', async () => {
    mockAuthedUser();
    const getPicks = vi.fn(async () => {
      throw new Error('provider down');
    });
    mockGetProvider.mockReturnValue({ getPicks } as any);
    mockCatalog();

    const mod = await import('@/app/[locale]/[city]/shop/(list)/page');
    const node = await mod.default(shopPageParams);
    const html = renderWithProviders(node);

    expect(getPicks).toHaveBeenCalledOnce();
    expect(html).not.toContain('data-testid="buy-again"');
    expect(html).not.toContain('data-testid="recommended"');
  });

  it('hides strips when provider returns empty picks', async () => {
    mockAuthedUser();
    mockGetProvider.mockReturnValue({ getPicks: vi.fn(async () => emptyPicks) } as any);
    mockCatalog();

    const mod = await import('@/app/[locale]/[city]/shop/(list)/page');
    const node = await mod.default(shopPageParams);
    const html = renderWithProviders(node);

    expect(html).not.toContain('data-testid="buy-again"');
    expect(html).not.toContain('data-testid="recommended"');
  });
});

describe('ProductPage integration with personalization', () => {
  it('renders RecommendedCarousel below ProductDetail for an authed user, excluding current slug', async () => {
    mockAuthedUser();
    const getPicks = vi.fn(async () => samplePicks);
    mockGetProvider.mockReturnValue({ getPicks } as any);
    mockCatalog();

    const mod = await import('@/app/[locale]/[city]/shop/[slug]/page');
    const node = await mod.default(productPageParams);
    const html = renderWithProviders(node);

    expect(getPicks).toHaveBeenCalledWith('uid-123', expect.objectContaining({ limit: 8, locale: 'en', excludeSlug: 'rose-hour' }));
    expect(html).toContain('data-testid="recommended"');
    expect(html).toContain('data-count="1"');
  });

  it('does not render carousel for an anonymous user on product detail', async () => {
    mockAnonymous();
    const getPicks = vi.fn();
    mockGetProvider.mockReturnValue({ getPicks } as any);
    mockCatalog();

    const mod = await import('@/app/[locale]/[city]/shop/[slug]/page');
    const node = await mod.default(productPageParams);
    const html = renderWithProviders(node);

    expect(getPicks).not.toHaveBeenCalled();
    expect(html).not.toContain('data-testid="recommended"');
  });

  it('does not block product detail when provider throws', async () => {
    mockAuthedUser();
    mockGetProvider.mockReturnValue({
      getPicks: vi.fn(async () => {
        throw new Error('db down');
      }),
    } as any);
    mockCatalog();

    const mod = await import('@/app/[locale]/[city]/shop/[slug]/page');
    const node = await mod.default(productPageParams);
    const html = renderWithProviders(node);

    expect(html).not.toContain('data-testid="recommended"');
  });
});
