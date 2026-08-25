import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { getBaseUrl } from './base-url';

let browser: Browser;
let page: Page;

beforeAll(async () => {
  const headed = process.env.E2E_HEADED === '1';
  browser = await chromium.launch({ headless: !headed, slowMo: headed ? 400 : 0 });
  const context = await browser.newContext();
  page = await context.newPage();
}, 60_000);

afterAll(async () => {
  await browser?.close();
});

describe('Rosette storefront (Playwright deterministic E2E)', () => {
  it('navigates from the homepage hero into the collection', async () => {
    await page.goto(`${getBaseUrl()}/en/cairo`, { waitUntil: 'domcontentloaded' });
    expect(new URL(page.url()).pathname).toBe('/en/cairo');

    await page.getByRole('link', { name: /explore the collection/i }).click();
    await page.waitForURL(/\/shop$/);

    expect(new URL(page.url()).pathname).toMatch(/\/shop$/);
    const firstProductLink = page.locator('a[href*="/shop/"]').first();
    await firstProductLink.waitFor({ state: 'visible', timeout: 10_000 });
  });

  it('adds a bouquet to the bag from its product page', async () => {
    await page.goto(`${getBaseUrl()}/en/cairo/shop/rose-hour`, { waitUntil: 'domcontentloaded' });
    expect(new URL(page.url()).pathname).toContain('/shop/rose-hour');

    await page.getByRole('button', { name: /add to bag/i }).click();

    const confirmation = page.getByRole('status').first();
    await confirmation.waitFor({ state: 'visible', timeout: 15_000 });
    const text = (await confirmation.textContent()) ?? '';
    expect(text.toLowerCase()).toContain('bag');
  });

  it('shows product cards with prices on the shop page', async () => {
    await page.goto(`${getBaseUrl()}/en/cairo/shop`, { waitUntil: 'domcontentloaded' });

    const cards = page.locator('a[href*="/shop/"]');
    await cards.first().waitFor({ state: 'visible', timeout: 15_000 });
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);

    // at least one card shows a price (EGP)
    const pricedCard = cards.filter({ hasText: /EGP/i }).first();
    await pricedCard.waitFor({ state: 'visible', timeout: 15_000 });
  });

  it('shows the Stitch header nav and full footer on the storefront', async () => {
    await page.goto(`${getBaseUrl()}/en/cairo`, { waitUntil: 'domcontentloaded' });
    for (const name of ['Collections', 'Bespoke', 'Atelier', 'Gifts']) {
      await page.getByRole('link', { name, exact: true }).waitFor({ state: 'visible', timeout: 15_000 });
    }
    await page.getByRole('link', { name: 'Privacy' }).waitFor({ state: 'visible', timeout: 10_000 });
    await page.getByRole('contentinfo').waitFor({ state: 'visible', timeout: 10_000 });
  });

  it('renders the size selector once variants are readable', async () => {
    await page.goto(`${getBaseUrl()}/en/cairo/shop/rose-hour`, { waitUntil: 'domcontentloaded' });
    await page.getByText(/choose a size/i).first().waitFor({ state: 'visible', timeout: 15_000 });
  });

  it('renders the tracking page inside site chrome', async () => {
    await page.goto(`${getBaseUrl()}/en/cairo/track`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('banner').waitFor({ state: 'visible', timeout: 10_000 });
    await page.getByRole('contentinfo').waitFor({ state: 'visible', timeout: 10_000 });
  });

  it('renders the static pages linked from the footer', async () => {
    for (const path of ['/about', '/contact', '/privacy']) {
      await page.goto(`${getBaseUrl()}/en/cairo${path}`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('heading', { level: 1 }).waitFor({ state: 'visible', timeout: 10_000 });
      await page.getByRole('contentinfo').waitFor({ state: 'visible', timeout: 10_000 });
    }
  });
});
