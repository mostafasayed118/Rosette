import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  usePathname: () => '/en/cairo/shop',
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({ locale: 'en', city: 'cairo' }),
}));

vi.mock('@/features/i18n/I18nProvider', () => ({
  useI18n: () => ({ t: (key: string) => key, locale: 'en', dir: 'ltr' }),
}));

vi.mock('@/features/i18n/use-store-path', () => ({
  useStorePath: () => ({ locale: 'en', href: (p: string) => `/en/cairo${p}` }),
}));

describe('responsive layout guards', () => {
  it('keeps the catalog filter bar inside the container instead of a computed bleed', async () => {
    const { CatalogToolbar } = await import('@/features/catalog/CatalogToolbar');
    const { container } = render(<CatalogToolbar />);
    const section = container.querySelector('section') as HTMLElement;
    // The old `min(calc((100vw-80rem)/2), 1.5rem)` offset went negative below
    // 1280px and flipped into a ~460px positive margin on phones.
    expect(section.className).not.toMatch(/calc\(\(100vw-80rem\)\/2\)/);
    expect(section.className).toContain('-mx-4');
  });

  it('makes the gift-card amount row a containing block so sr-only radios cannot escape its clip', async () => {
    const { GiftCardPurchaseForm } = await import('@/features/gift-cards/GiftCardPurchaseForm');
    const { container } = render(<GiftCardPurchaseForm cityCode="cairo" />);
    const row = container.querySelector('fieldset div') as HTMLElement;
    expect(row.className).toContain('overflow-x-auto');
    expect(row.className).toContain('relative');
  });

  it('lets the gift-card form column shrink so the grid track cannot expand', async () => {
    const { GiftCardPurchaseForm } = await import('@/features/gift-cards/GiftCardPurchaseForm');
    const { container } = render(<GiftCardPurchaseForm cityCode="cairo" />);
    const fieldset = container.querySelector('fieldset') as HTMLElement;
    expect(fieldset.closest('.min-w-0')).toBeTruthy();
  });

  it('scales site gutters down on tablet and restores them on wide screens', async () => {
    const { readFileSync } = await import('node:fs');
    const css = readFileSync('app/globals.css', 'utf8');
    // 8rem gutters at 768px left too little content width for the header.
    expect(css).toMatch(/@media \(min-width: 768px\) \{ \.site-container \{ width: min\(calc\(100% - 4rem\)/);
    expect(css).toMatch(/@media \(min-width: 1280px\) \{ \.site-container \{ width: min\(calc\(100% - 8rem\)/);
  });

  it('gives standalone links a minimum tap target on coarse pointers', async () => {
    const { readFileSync } = await import('node:fs');
    const css = readFileSync('app/globals.css', 'utf8');
    expect(css).toContain('@media (pointer: coarse)');
    expect(css).toContain('padding-block: 4px');
  });

  it('suppresses the hydration warning on the locale-swapped skip link', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync('app/layout.tsx', 'utf8');
    expect(source).toContain('id="skip-to-content"');
    expect(source).toMatch(/<a id="skip-to-content"[^>]*suppressHydrationWarning/);
  });
});
