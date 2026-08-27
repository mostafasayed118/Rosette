import { describe, it, expect, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { I18nProvider } from '@/features/i18n/I18nProvider';
import { ThemeProvider } from '@/features/theme/ThemeProvider';
import RootNotFound from '@/app/not-found';

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
  getServerSupabase: vi.fn(),
}));

vi.mock('next/headers', () => ({
  cookies: () => ({ get: () => undefined }),
}));

describe('app/not-found (root)', () => {
  it('renders the 404 error shell pointing back to /en', async () => {
    const node = await RootNotFound();
    const html = renderToString(<ThemeProvider><I18nProvider initialLocale="en">{node}</I18nProvider></ThemeProvider>);
    expect(html).toContain('4·0·4');
    expect(html).toContain('That page has wandered off.');
    expect(html).toContain('Browse flowers');
    expect(html).toContain('href="/en"');
  });
});
