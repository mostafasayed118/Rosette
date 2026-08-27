import { describe, it, expect, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { I18nProvider } from '@/features/i18n/I18nProvider';
import { ThemeProvider } from '@/features/theme/ThemeProvider';
import LocaleNotFound from '@/app/[locale]/not-found';
import LocaleForbidden from '@/app/[locale]/forbidden';
import LocaleUnauthorized from '@/app/[locale]/unauthorized';

vi.mock('next/headers', () => ({
  cookies: () => ({ get: () => undefined }),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
  getServerSupabase: vi.fn(),
}));

async function renderServer(node: React.ReactElement) {
  return renderToString(<ThemeProvider><I18nProvider initialLocale="en">{node}</I18nProvider></ThemeProvider>);
}

describe('app/[locale]/not-found', () => {
  it('renders the 404 status with translated copy', async () => {
    const node = await LocaleNotFound();
    const html = await renderServer(node);
    expect(html).toContain('4·0·4');
    expect(html).toContain('This page got lost.');
    expect(html).toContain('Browse the flowers');
    expect(html).toContain('href="/en"');
  });
});

describe('app/[locale]/forbidden', () => {
  it('renders the 403 status with translated copy', async () => {
    const node = await LocaleForbidden();
    const html = await renderServer(node);
    expect(html).toContain('4·0·3');
    expect(html).toContain('This corner is for the team only.');
    expect(html).toContain('Back home');
    expect(html).toContain('href="/en"');
  });
});

describe('app/[locale]/unauthorized', () => {
  it('renders the 401 status with translated copy', async () => {
    const node = await LocaleUnauthorized();
    const html = await renderServer(node);
    expect(html).toContain('4·0·1');
    expect(html).toContain('This page is for signed-in visitors.');
    expect(html).toContain('Sign in');
    expect(html).toContain('Back home');
    expect(html).toContain('/en/login');
  });
});
